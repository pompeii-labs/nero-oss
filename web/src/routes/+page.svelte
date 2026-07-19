<script lang="ts">
    import '$lib/design/themes.css';
    import { onMount, onDestroy } from 'svelte';
    import { fade } from 'svelte/transition';
    import { fieldTheme } from '$lib/stores/field-theme.svelte';
    import Atmosphere from '$lib/components/field/Atmosphere.svelte';
    import Orb from '$lib/components/field/Orb.svelte';
    import Message from '$lib/components/field/Message.svelte';
    import ToolGroup from '$lib/components/field/ToolGroup.svelte';
    import Composer, { type PendingFile } from '$lib/components/field/Composer.svelte';
    import Settings from '$lib/components/field/Settings.svelte';
    import ThemeSwitch from '$lib/components/field/ThemeSwitch.svelte';
    import type { WakewordListener } from '$lib/wakeword';
    import {
        startVoice,
        type VoiceSession,
        type VoiceState,
        type TurnPhase,
        type VoiceActivity,
    } from '$lib/voice';
    import type { ToolActivity as ToolActivityType } from '$lib/actions/chat';
    import {
        loadMessages,
        subscribeMessages,
        subscribeDispatches,
        subscribeDevices,
        subscribePresence,
        subscribePanels,
        subscribeQuestions,
        subscribeProjects,
        subscribeProjectTasks,
        subscribeSettings,
        type MessageRow,
        type DispatchRow,
        type DeviceRow,
        type PanelRow,
        type QuestionRow,
        type ProjectRow,
        type ProjectTaskRow,
    } from '$lib/lux';
    import PanelLayer from '$lib/components/field/PanelLayer.svelte';
    import AskCard from '$lib/components/field/AskCard.svelte';
    import ProjectApprovalCard from '$lib/components/field/ProjectApprovalCard.svelte';
    import MergeApprovalCard from '$lib/components/field/MergeApprovalCard.svelte';
    import ProjectPanel from '$lib/components/field/ProjectPanel.svelte';
    import type { PanelAction } from '$lib/panels/types';
    import {
        closePanel,
        movePanel,
        interactPanel,
        callPanel,
        maximizePanel,
    } from '$lib/actions/panels';
    import { answerQuestion, dismissQuestion } from '$lib/actions/ask';
    import {
        runProject,
        tweakProject,
        rejectProject,
        pauseProject,
        resumeProject,
        cancelProject,
        dismissProject as dismissProjectAction,
        mergeApprove,
    } from '$lib/actions/projects';
    import { sendMessage, cancelDispatch, type AttachmentUpload } from '$lib/actions/nero';
    import {
        deviceId,
        registerDevice,
        heartbeatDevice,
        bringNeroHere,
        setAmbient,
    } from '$lib/device';
    import { getServerUrl } from '$lib/actions/helpers';
    import { executeCommand, type CommandResult } from '$lib/commands';
    import { goto } from '$app/navigation';

    interface FileRef {
        id: string;
        name: string;
        originalName: string;
        mimeType: string;
        size: number;
        previewUrl?: string;
    }

    function fileToBase64(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function toFileRefs(atts: MessageRow['attachments']): FileRef[] {
        return (atts ?? []).map((a) => ({
            id: a.id,
            name: a.name,
            originalName: a.name,
            mimeType: a.mime,
            size: 0,
            previewUrl: getServerUrl(`/v1/files/${a.id}`),
        }));
    }

    let msgs = $state<MessageRow[]>([]);
    let dispatchMap = $state<Record<string, DispatchRow>>({});
    let currentDispatchId = $state<string | null>(null);
    // Slash-command output (client-side commands never sent to Nero).
    let commandNotices = $state<{ key: string; content: string; error: boolean }[]>([]);
    let commandLoading = $state<string | null>(null);
    let noticeSeq = 0;
    let connectionError = $state<string | null>(null);
    let connected = $state(false);
    let scroller: HTMLDivElement | null = $state(null);
    let atBottom = $state(true);
    let pendingSteering = $state<string[]>([]);

    let unsubMessages: (() => void) | null = null;
    let unsubDispatches: (() => void) | null = null;
    let unsubDevices: (() => void) | null = null;
    let unsubPresence: (() => void) | null = null;
    let unsubPanels: (() => void) | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    // Multi-device presence: the orb is a single entity that lives on one screen.
    const myDeviceId = deviceId();
    let neroDevice = $state<string | null>(null);
    let devices = $state<DeviceRow[]>([]);
    const neroIsHere = $derived(neroDevice === myDeviceId);
    const neroDeviceName = $derived(devices.find((d) => d.id === neroDevice)?.name ?? null);
    // This screen's server-assigned name (main / a callsign / ?name=).
    const myDeviceName = $derived(devices.find((d) => d.id === myDeviceId)?.name ?? '');

    // Presence tier for THIS screen. focus: Nero is here (conversation + voice).
    // ambient: opted-in, shows a glanceable orb + listens for the wakeword even when
    // Nero is elsewhere. dormant: a plain screen with a summon button.
    const amAmbient = $derived(devices.find((d) => d.id === myDeviceId)?.ambient ?? false);
    const myTier = $derived(neroIsHere ? 'focus' : amAmbient ? 'ambient' : 'dormant');
    function toggleAmbient() {
        void setAmbient(!amAmbient);
    }

    // Travel animation: when Nero moves, the screen he leaves streaks him out and
    // the one he arrives on streaks him in (both fire off the same presence change).
    let travel = $state<'in' | 'out' | null>(null);
    let travelTimer: ReturnType<typeof setTimeout> | null = null;
    function startTravel(dir: 'in' | 'out') {
        travel = dir;
        if (travelTimer) clearTimeout(travelTimer);
        // 'in' is longer: the orb waits off-screen (in transit from the other screen),
        // then flies in. 'out' streaks off and is gone.
        travelTimer = setTimeout(() => (travel = null), dir === 'in' ? 1350 : 700);
    }

    // Panels Nero has thrown onto this screen.
    let panelMap = $state<Record<string, PanelRow>>({});
    const panels = $derived(
        Object.values(panelMap)
            .filter((p) => p.device_id === myDeviceId && p.status === 'open')
            .sort((a, b) => (a.z ?? 0) - (b.z ?? 0)),
    );
    // A question Nero is blocked on (the `ask` tool). Show the newest pending one
    // where Nero currently is.
    let questionMap = $state<Record<string, QuestionRow>>({});
    let unsubQuestions: (() => void) | null = null;
    let unsubSettings: (() => void) | null = null;
    const activeQuestion = $derived(
        Object.values(questionMap)
            .filter((q) => q.status === 'pending')
            .sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0))
            .at(-1) ?? null,
    );

    // Background projects: a plan awaiting approval (a card that blocks Nero's turn,
    // like ask) plus live dashboards for projects that are running/paused/finished.
    let projectMap = $state<Record<string, ProjectRow>>({});
    let projectTaskMap = $state<Record<string, ProjectTaskRow>>({});
    let unsubProjects: (() => void) | null = null;
    let unsubProjectTasks: (() => void) | null = null;
    let dismissedProjects = $state<Set<string>>(new Set());
    const tasksFor = (pid: string) =>
        Object.values(projectTaskMap).filter((t) => t.project_id === pid);
    const activeApproval = $derived(
        Object.values(projectMap)
            .filter((p) => p.status === 'awaiting_approval')
            .sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0))
            .at(-1) ?? null,
    );
    const dashboardProjects = $derived(
        Object.values(projectMap)
            .filter(
                (p) =>
                    ['running', 'paused', 'done', 'error'].includes(p.status ?? '') &&
                    !p.dismissed &&
                    !dismissedProjects.has(p.id),
            )
            .sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0)),
    );
    // Optimistically hide now; persist so it stays gone across reloads.
    function dismissProject(id: string) {
        dismissedProjects = new Set([...dismissedProjects, id]);
        void dismissProjectAction(id);
    }
    // A project's merge is blocked on the user approving a staged conflict resolution.
    const activeMergeConflict = $derived(
        Object.values(projectMap).find((p) => !!p.merge_conflict) ?? null,
    );

    function handlePanelAction(panelId: string, action: PanelAction, control: string) {
        if (action.type === 'interact') {
            const payload = { control, intent: action.intent, value: action.value };
            // While engaged (in a voice call), route through the voice turn so Nero
            // SPEAKS the reply; otherwise it's a text dispatch.
            if (engaged && voiceSession) voiceSession.interact({ panelId, ...payload });
            else void interactPanel(panelId, payload);
        } else if (action.type === 'call') {
            void callPanel(panelId, action.fn);
        }
    }

    onMount(async () => {
        wakewordOn = localStorage.getItem('nero.wakeword') === '1';
        try {
            const initial = await loadMessages();
            msgs = [...initial].sort((a, b) => a.id - b.id);
            unsubMessages = await subscribeMessages(initial, (c) => {
                if (c.kind === 'snapshot') msgs = [...c.rows].sort((a, b) => a.id - b.id);
                else if (c.kind === 'upsert') {
                    const i = msgs.findIndex((m) => m.id === c.row.id);
                    if (i >= 0) {
                        msgs[i] = c.row;
                        msgs = [...msgs];
                    } else msgs = [...msgs, c.row].sort((a, b) => a.id - b.id);
                    if (c.row.role === 'user' && c.row.type === 'message') {
                        const p = pendingSteering.indexOf(c.row.content ?? '');
                        if (p >= 0) pendingSteering = pendingSteering.toSpliced(p, 1);
                    }
                } else if (c.kind === 'delete') msgs = msgs.filter((m) => m.id !== c.row.id);
            });
            unsubDispatches = await subscribeDispatches((c) => {
                if (c.kind === 'snapshot') {
                    const o: Record<string, DispatchRow> = {};
                    for (const r of c.rows) o[r.id] = r;
                    dispatchMap = o;
                } else if (c.kind === 'upsert') {
                    dispatchMap = { ...dispatchMap, [c.row.id]: c.row };
                    if (
                        c.row.id === currentDispatchId &&
                        ['done', 'error', 'cancelled'].includes(c.row.status ?? '')
                    ) {
                        pendingSteering = [];
                    }
                } else if (c.kind === 'delete') {
                    const o = { ...dispatchMap };
                    delete o[c.row.id];
                    dispatchMap = o;
                }
            });
            // Register this screen as a device and track where the orb lives.
            await registerDevice();
            let presenceSeeded = false;
            unsubPresence = await subscribePresence((c) => {
                const row =
                    c.kind === 'snapshot' ? c.rows.find((r) => r.id === 'nero') : c.row;
                if (c.kind === 'delete') {
                    if (c.row.id === 'nero') neroDevice = null;
                } else if (row && row.id === 'nero') {
                    const prev = neroDevice;
                    neroDevice = row.device_id;
                    // A live move (not the initial snapshot): streak him in/out and,
                    // on arrival, default into the orb/presence canvas.
                    if (c.kind === 'upsert' && prev !== row.device_id) {
                        if (row.device_id === myDeviceId) {
                            startTravel('in');
                            presenceMode = true;
                        } else if (prev === myDeviceId) {
                            startTravel('out');
                            presenceMode = false;
                        }
                    }
                }
                // First device to ever open claims Nero, so he's never nowhere.
                if (c.kind === 'snapshot' && !presenceSeeded) {
                    presenceSeeded = true;
                    if (!c.rows.some((r) => r.id === 'nero')) void bringNeroHere();
                }
            });
            unsubDevices = await subscribeDevices((c) => {
                if (c.kind === 'snapshot') devices = c.rows;
                else if (c.kind === 'upsert') {
                    const i = devices.findIndex((d) => d.id === c.row.id);
                    if (i >= 0) devices[i] = c.row;
                    else devices = [...devices, c.row];
                    devices = [...devices];
                } else if (c.kind === 'delete')
                    devices = devices.filter((d) => d.id !== c.row.id);
            });
            unsubPanels = await subscribePanels((c) => {
                if (c.kind === 'snapshot') {
                    const o: Record<string, PanelRow> = {};
                    for (const r of c.rows) o[r.id] = r;
                    panelMap = o;
                } else if (c.kind === 'upsert') {
                    panelMap = { ...panelMap, [c.row.id]: c.row };
                } else if (c.kind === 'delete') {
                    const o = { ...panelMap };
                    delete o[c.row.id];
                    panelMap = o;
                }
            });
            unsubQuestions = await subscribeQuestions((c) => {
                if (c.kind === 'snapshot') {
                    const o: Record<string, QuestionRow> = {};
                    for (const r of c.rows) o[r.id] = r;
                    questionMap = o;
                } else if (c.kind === 'upsert') {
                    questionMap = { ...questionMap, [c.row.id]: c.row };
                } else if (c.kind === 'delete') {
                    const o = { ...questionMap };
                    delete o[c.row.id];
                    questionMap = o;
                }
            });
            unsubProjects = await subscribeProjects((c) => {
                if (c.kind === 'snapshot') {
                    const o: Record<string, ProjectRow> = {};
                    for (const r of c.rows) o[r.id] = r;
                    projectMap = o;
                } else if (c.kind === 'upsert') {
                    projectMap = { ...projectMap, [c.row.id]: c.row };
                } else if (c.kind === 'delete') {
                    const o = { ...projectMap };
                    delete o[c.row.id];
                    projectMap = o;
                }
            });
            unsubProjectTasks = await subscribeProjectTasks((c) => {
                if (c.kind === 'snapshot') {
                    const o: Record<string, ProjectTaskRow> = {};
                    for (const r of c.rows) o[r.id] = r;
                    projectTaskMap = o;
                } else if (c.kind === 'upsert') {
                    projectTaskMap = { ...projectTaskMap, [c.row.id]: c.row };
                } else if (c.kind === 'delete') {
                    const o = { ...projectTaskMap };
                    delete o[c.row.id];
                    projectTaskMap = o;
                }
            });
            // Theme + day/night are shared: apply whatever any screen last set.
            unsubSettings = await subscribeSettings((c) => {
                const rows = c.kind === 'snapshot' ? c.rows : c.kind === 'upsert' ? [c.row] : [];
                for (const r of rows) {
                    if (r.key === 'field_theme' && (r.value === 'obsidian' || r.value === 'forge'))
                        fieldTheme.applyTheme(r.value);
                    else if (r.key === 'field_mode' && (r.value === 'day' || r.value === 'night'))
                        fieldTheme.applyMode(r.value);
                }
            });
            heartbeat = setInterval(() => void heartbeatDevice(), 15_000);

            connected = true;
        } catch (e) {
            connectionError = e instanceof Error ? e.message : String(e);
            connected = false;
        }
    });

    onDestroy(() => {
        unsubMessages?.();
        unsubDispatches?.();
        unsubDevices?.();
        unsubPresence?.();
        unsubPanels?.();
        unsubQuestions?.();
        unsubProjects?.();
        unsubProjectTasks?.();
        unsubSettings?.();
        wakeword?.stop();
        if (heartbeat) clearInterval(heartbeat);
    });

    // The dispatch the orb reflects. My own dispatch (started from the composer)
    // is always honored. A foreign running dispatch (e.g. a panel interaction)
    // lights the orb up too, but only if it's genuinely fresh — an old row stuck
    // at 'running' from a crashed process must never pin the UI in THINKING.
    const RUNNING = ['thinking', 'running', 'compacting'];
    const FRESH_MS = 120_000;
    const active = $derived.by(() => {
        const mine = currentDispatchId ? (dispatchMap[currentDispatchId] ?? null) : null;
        if (mine && RUNNING.includes(mine.status ?? '')) return mine;
        const fresh = Object.values(dispatchMap)
            .filter(
                (d) =>
                    RUNNING.includes(d.status ?? '') &&
                    Date.now() - (d.updated_at || d.created_at || 0) < FRESH_MS,
            )
            .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))[0];
        return fresh ?? mine;
    });
    const isRunning = $derived(
        !!active && ['thinking', 'running', 'compacting'].includes(active.status ?? ''),
    );
    const showLoader = $derived(!!active && ['thinking', 'running'].includes(active.status ?? ''));
    const toolActive = $derived(
        isRunning && (active?.activities ?? []).some((a) => a.status === 'running'),
    );

    // A fast tool finishes before its "running" status is even delivered, and the
    // gaps between tool calls read as dead space. So latch the orb into its "tool"
    // state whenever a NEW tool fires and hold it for a minimum dwell: consecutive
    // tools keep re-latching it (bridging the gaps), and it relaxes back to
    // thinking only once the tool calls actually stop.
    const TOOL_DWELL = 1500;
    let toolHold = $state(false);
    let toolTimer: ReturnType<typeof setTimeout> | null = null;
    let seenTools = 0;
    $effect(() => {
        const count = isRunning ? (active?.activities?.length ?? 0) : 0;
        if (count > seenTools) {
            toolHold = true;
            if (toolTimer) clearTimeout(toolTimer);
            toolTimer = setTimeout(() => {
                toolHold = false;
                toolTimer = null;
            }, TOOL_DWELL);
        }
        seenTools = count;
    });

    // Compaction is quiet background bookkeeping (a separate chip), so the orb
    // stays calm during it, only active thinking/tools light it up.
    const orbState = $derived<'idle' | 'thinking' | 'speaking' | 'tool'>(
        !showLoader ? 'idle' : toolActive || toolHold ? 'tool' : 'thinking',
    );

    function formatToolName(name: string): string {
        return name
            .replace(/_/g, ' ')
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .replace(/\b\w/g, (c) => c.toUpperCase())
            .trim();
    }

    function toolFromMessage(m: MessageRow): ToolActivityType {
        const meta = (m.metadata ?? {}) as Record<string, unknown>;
        const result = meta.result;
        const fn = String(meta.fn_name ?? 'tool');
        return {
            id: String(meta.tool_id ?? m.id),
            tool: fn,
            displayName: formatToolName(fn),
            args: (meta.args as Record<string, unknown>) ?? {},
            status: meta.status === 'error' ? 'error' : 'complete',
            result:
                result == null ? undefined : typeof result === 'string' ? result : JSON.stringify(result),
        };
    }

    function toolFromActivity(a: NonNullable<DispatchRow['activities']>[number]): ToolActivityType {
        return {
            id: a.id,
            tool: a.tool,
            displayName: formatToolName(a.tool),
            args: a.args ?? {},
            status: a.status === 'success' ? 'complete' : a.status,
            result: a.result,
        };
    }

    type Item =
        | { kind: 'msg'; key: string; role: 'user' | 'assistant' | 'system'; content: string; attachments: FileRef[] }
        | { kind: 'tools'; key: string; tools: ToolActivityType[] }
        | { kind: 'event'; key: string; label: string };

    // Strip the agent-facing label to a short, human event line.
    function interactionLabel(content: string): string {
        const m = content.match(/pressed "([^"]+)"[^]*?panel "([^"]+)"/);
        if (m) return `pressed ${m[1]} · ${m[2]}`;
        const m2 = content.match(/panel "([^"]+)"[^]*?pressed "([^"]+)"/);
        if (m2) return `pressed ${m2[2]} · ${m2[1]}`;
        return content.replace(/^\[interaction\]\s*/, '');
    }

    const timeline = $derived.by(() => {
        const out: Item[] = [];
        for (const m of msgs) {
            // Panel interactions are first-class timeline events, not chat bubbles.
            if (m.type === 'interaction') {
                out.push({ kind: 'event', key: `e${m.id}`, label: interactionLabel(m.content ?? '') });
                continue;
            }
            if (m.type === 'tool_call') {
                const last = out[out.length - 1];
                const t = toolFromMessage(m);
                if (last && last.kind === 'tools') last.tools.push(t);
                else out.push({ kind: 'tools', key: `t${m.id}`, tools: [t] });
            } else {
                out.push({
                    kind: 'msg',
                    key: `m${m.id}`,
                    role: (m.role ?? 'assistant') as 'user' | 'assistant' | 'system',
                    content: m.content ?? '',
                    attachments: toFileRefs(m.attachments),
                });
            }
        }
        return out;
    });

    const durableToolIds = $derived(
        new Set(
            msgs
                .filter((m) => m.type === 'tool_call')
                .map((m) => String((m.metadata as Record<string, unknown> | null)?.tool_id ?? m.id)),
        ),
    );
    const liveActivities = $derived(
        isRunning
            ? (active?.activities ?? []).filter((a) => !durableToolIds.has(a.id)).map(toolFromActivity)
            : [],
    );

    const loaderText = $derived(
        active?.status === 'compacting'
            ? 'Compacting memory'
            : liveActivities.length
              ? (liveActivities[liveActivities.length - 1].displayName ?? 'Working')
              : 'Thinking',
    );

    const hasConversation = $derived(
        timeline.length > 0 ||
            isRunning ||
            pendingSteering.length > 0 ||
            commandNotices.length > 0,
    );

    // Compaction is live either automatically (dispatch status) or via manual
    // /compact (its command loader). Both surface the same quiet chip.
    const isCompacting = $derived(
        active?.status === 'compacting' || (commandLoading?.toLowerCase().includes('compact') ?? false),
    );

    // Presence mode is the ambient canvas: the orb lives here, panels float around
    // it, chat recedes. Cmd/Ctrl+Enter enters/exits it. Talking (`engaged`) is a
    // separate interaction WITHIN presence, not what summons the canvas, so a screen
    // can show Nero present + panels without being in a live call.
    let presenceMode = $state(false);
    let engaged = $state(false);
    // When a question or a plan-approval is up in chat mode, that card stands in for
    // the composer.
    const askReplacesComposer = $derived(
        !!(activeQuestion || activeApproval) && neroIsHere && !engaged,
    );
    // While blocked on the user (a question or plan approval) Nero is waiting, not
    // working — idle orb.
    const waitingOnUser = $derived(!!(activeQuestion || activeApproval) && neroIsHere);
    $effect(() => {
        function onKey(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                presenceMode = !presenceMode;
                if (!presenceMode) engaged = false;
            } else if (e.key === 'Escape' && presenceMode) {
                if (engaged) engaged = false;
                else presenceMode = false;
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });
    // Tapping the orb in presence mode starts/stops talking.
    function toggleTalk() {
        if (presenceMode) engaged = !engaged;
    }
    // Touch-friendly presence exit (no Esc key on a phone): stop voice, then leave.
    function exitPresence() {
        if (engaged) engaged = false;
        else presenceMode = false;
    }

    // Voice session lifecycle: open when engaged, tear down when disengaged.
    // Mic needs a secure context; over plain-HTTP (a LAN IP on a phone) it's blocked.
    const insecureContext = typeof window !== 'undefined' && !window.isSecureContext;
    let voiceSession = $state<VoiceSession | null>(null);
    let voiceState = $state<VoiceState>('idle');
    let liveTranscript = $state('');
    let voicePhase = $state<TurnPhase | null>(null);
    let voiceActivities = $state<VoiceActivity[]>([]);

    // After a minute of no one speaking (and no wakeword), the call goes quiet; say the
    // wakeword to re-engage. Reset on any speech in either direction.
    const VOICE_IDLE_MS = 60_000;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    function bumpVoiceIdle() {
        if (idleTimer) clearTimeout(idleTimer);
        if (!engaged) return;
        idleTimer = setTimeout(() => {
            if (engaged) {
                engaged = false;
                chime([880, 660]);
            }
        }, VOICE_IDLE_MS);
    }

    $effect(() => {
        if (engaged && !voiceSession) {
            bumpVoiceIdle();
            startVoice({
                onState: (s) => (voiceState = s),
                onTranscript: (text) => {
                    liveTranscript = text;
                    bumpVoiceIdle();
                },
                onTurn: (phase) => {
                    voicePhase = phase;
                    // A fresh user turn clears the prior turn's tool trail.
                    if (phase === 'listening' || phase === 'thinking') voiceActivities = [];
                    bumpVoiceIdle();
                },
                onActivity: (a) => {
                    const i = voiceActivities.findIndex((x) => x.id === a.id);
                    if (i >= 0) voiceActivities[i] = a;
                    else voiceActivities = [...voiceActivities, a];
                },
            })
                .then((s) => (voiceSession = s))
                .catch(() => (voiceState = 'error'));
        } else if (!engaged && voiceSession) {
            if (idleTimer) clearTimeout(idleTimer);
            voiceSession.stop();
            voiceSession = null;
            voiceState = 'idle';
            liveTranscript = '';
            voicePhase = null;
            voiceActivities = [];
        }
    });

    // Wakeword: opt-in per device (localStorage). When armed + present + on a secure
    // origin + NOT already in a call, listen for the wakeword; a detection summons Nero
    // here and opens voice. Listening pauses during a live call to free the mic, then the
    // reactive guard below re-arms it when the call ends.
    let wakewordOn = $state(false);
    let settingsOpen = $state(false);
    let settingsTab = $state<'models' | 'secrets' | 'mcp'>('secrets');
    let wakewordStatus = $state<'off' | 'arming' | 'on' | 'error' | 'insecure'>('off');
    let wakeword: WakewordListener | null = null;

    $effect(() => {
        const shouldListen =
            wakewordOn && (neroIsHere || amAmbient) && !insecureContext && !engaged;
        if (shouldListen && !wakeword) void armWakeword();
        else if (!shouldListen && wakeword) disarmWakeword();
    });

    // Ascending [660,880] on wake, descending [880,660] on idle-exit.
    function chime(freqs: number[]) {
        try {
            const ctx = new AudioContext();
            const now = ctx.currentTime;
            for (const [i, freq] of freqs.entries()) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                const t = now + i * 0.09;
                gain.gain.setValueAtTime(0, t);
                gain.gain.linearRampToValueAtTime(0.13, t + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.22);
                osc.connect(gain).connect(ctx.destination);
                osc.start(t);
                osc.stop(t + 0.24);
            }
            setTimeout(() => void ctx.close(), 700);
        } catch {
            /* audio unavailable */
        }
    }

    async function armWakeword() {
        wakewordStatus = 'arming';
        const { WakewordListener } = await import('$lib/wakeword');
        const w = new WakewordListener({
            threshold: 0.6,
            onDetect: () => {
                chime([660, 880]);
                if (!neroIsHere) void bringNeroHere();
                presenceMode = true;
                engaged = true;
                bumpVoiceIdle();
            },
        });
        try {
            await w.load();
            await w.start();
            wakeword = w;
            wakewordStatus = 'on';
        } catch (e) {
            wakeword = null;
            wakewordStatus = (e as Error).message.includes('insecure') ? 'insecure' : 'error';
            console.error('[wakeword] arm failed', e);
        }
    }

    function disarmWakeword() {
        wakeword?.stop();
        wakeword = null;
        if (wakewordStatus === 'on' || wakewordStatus === 'arming') wakewordStatus = 'off';
    }

    function toggleWakeword() {
        wakewordOn = !wakewordOn;
        try {
            localStorage.setItem('nero.wakeword', wakewordOn ? '1' : '0');
        } catch {
            /* private mode */
        }
    }

    // A voice tool can finish in well under a frame; latch the "tool" look for a
    // short dwell whenever a NEW tool fires so it's actually watchable (the chat
    // orb does the same). The chip shows the latest tool through the dwell.
    const VOICE_TOOL_DWELL = 1100;
    let voiceToolHold = $state(false);
    let voiceToolTimer: ReturnType<typeof setTimeout> | null = null;
    let seenVoiceTools = 0;
    // Map the live voice activities to the shared ToolGroup shape so voice shows the
    // same expandable tool cards the chat does (status 'success' -> the group's 'complete').
    const voiceTools = $derived(
        voiceActivities.map((a) => ({
            id: a.id,
            tool: a.details?.fn_name ?? '',
            displayName: a.details?.display_name ?? a.details?.fn_name ?? 'tool',
            args: {},
            status: a.status === 'success' ? 'complete' : a.status,
            result: a.details?.result,
        })) as ToolActivityType[],
    );
    $effect(() => {
        const n = voiceActivities.length;
        if (n > seenVoiceTools) {
            voiceToolHold = true;
            if (voiceToolTimer) clearTimeout(voiceToolTimer);
            voiceToolTimer = setTimeout(() => {
                voiceToolHold = false;
                voiceToolTimer = null;
            }, VOICE_TOOL_DWELL);
        }
        seenVoiceTools = n;
    });

    // In voice mode the orb is driven by the live turn phase off the socket, not
    // the dispatch table, so it reacts the instant Flux/the model/TTS transition.
    const voiceToolActive = $derived(
        voiceActivities.some((a) => a.status === 'running') || voiceToolHold,
    );
    const voiceOrbState = $derived<'idle' | 'thinking' | 'speaking' | 'tool'>(
        voiceToolActive
            ? 'tool'
            : voicePhase === 'thinking'
              ? 'thinking'
              : voicePhase === 'speaking'
                ? 'speaking'
                : 'idle',
    );

    async function handleSend(text: string, files?: PendingFile[]) {
        if (!text.trim() && !(files && files.length)) return;
        let uploads: AttachmentUpload[] | undefined;
        if (files && files.length) {
            uploads = await Promise.all(
                files.map(async (f) => ({
                    data: await fileToBase64(f.file),
                    name: f.file.name,
                    mimeType: f.file.type || 'application/octet-stream',
                })),
            );
        }
        const res = await sendMessage(text, uploads);
        if (res?.steered) pendingSteering = [...pendingSteering, text];
        else if (res) currentDispatchId = res.dispatchId;
    }

    function pushNotice(content: string, error = false) {
        const key = `n${noticeSeq++}`;
        commandNotices = [...commandNotices, { key, content, error }];
        // Command output is transient confirmation, not conversation; auto-dismiss
        // so it doesn't pile up above the composer.
        setTimeout(() => {
            commandNotices = commandNotices.filter((n) => n.key !== key);
        }, 7000);
    }
    async function handleCommand(input: string) {
        const res = await executeCommand(input, {
            clearMessages: () => (commandNotices = []),
            setLoading: (m) => (commandLoading = m),
            log: (m) => pushNotice(m),
            navigateTo: (path) => goto(path),
            openSettings: (t) => {
                settingsTab = (t as 'models' | 'secrets' | 'mcp') ?? 'models';
                settingsOpen = true;
            },
        }).catch((e): CommandResult => ({ error: e instanceof Error ? e.message : String(e) }));
        commandLoading = null;
        if (res.shouldClear) commandNotices = [];
        if (res.error) pushNotice(res.error, true);
        else if (res.message) pushNotice(res.message);
        else if (res.widget) pushNotice(`(${res.widget.type} panel not rendered yet)`);
    }

    async function handleStop() {
        if (currentDispatchId && dispatchMap[currentDispatchId]) {
            dispatchMap = {
                ...dispatchMap,
                [currentDispatchId]: { ...dispatchMap[currentDispatchId], status: 'cancelled' },
            };
        }
        await cancelDispatch();
    }

    function onScroll() {
        if (!scroller) return;
        atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
    }

    $effect(() => {
        timeline.length;
        liveActivities.length;
        isRunning;
        commandNotices.length;
        pendingSteering.length;
        if (atBottom && scroller) {
            requestAnimationFrame(() => scroller && (scroller.scrollTop = scroller.scrollHeight));
        }
    });
</script>

<div class="field" class:presence={presenceMode} data-theme={fieldTheme.dataTheme}>
    <Atmosphere />

    <!-- panels Nero throws onto this screen (independent of where the orb is) -->
    <PanelLayer
        {panels}
        onAction={handlePanelAction}
        onMove={(id, x, y) => void movePanel(id, { x, y })}
        onResize={(id, w, h) => void movePanel(id, { w, h })}
        onClose={(id) => void closePanel(id)}
        onMaximize={(id, on) => void maximizePanel(id, on)}
        onPoll={(id, fn) => void callPanel(id, fn)}
    />

    <!-- a question Nero is waiting on: a focused card; his turn is blocked on it -->
    {#if neroIsHere && activeQuestion}
        {@const q = activeQuestion}
        <AskCard
            question={q}
            placement={engaged ? 'rail' : 'composer'}
            onAnswer={(answers) => void answerQuestion(q.id, answers)}
            onDismiss={() => void dismissQuestion(q.id)}
        />
    {:else if neroIsHere && activeApproval}
        <!-- a project plan awaiting the user's go-ahead; blocks Nero's turn -->
        {@const p = activeApproval}
        <ProjectApprovalCard
            project={p}
            tasks={tasksFor(p.id)}
            placement={engaged ? 'rail' : 'composer'}
            onRun={(budget) => void runProject(p.id, budget)}
            onTweak={(note) => void tweakProject(p.id, note)}
            onCancel={() => void rejectProject(p.id)}
        />
    {/if}

    <!-- a merge blocked on the user reviewing a staged conflict resolution -->
    {#if activeMergeConflict}
        {@const mp = activeMergeConflict}
        <MergeApprovalCard
            project={mp}
            onApprove={() => void mergeApprove(mp.id, 'approve')}
            onReject={() => void mergeApprove(mp.id, 'reject')}
        />
    {/if}

    <!-- live dashboards for background projects (running / paused / finished) -->
    {#if neroIsHere && dashboardProjects.length}
        <div class="project-dock">
            {#each dashboardProjects as p (p.id)}
                <ProjectPanel
                    project={p}
                    tasks={tasksFor(p.id)}
                    onPause={() => void pauseProject(p.id)}
                    onResume={() => void resumeProject(p.id)}
                    onCancel={() => void cancelProject(p.id)}
                    onDismiss={() => dismissProject(p.id)}
                />
            {/each}
        </div>
    {/if}

    <!-- the one orb: a single entity that lives on one screen. Renders only where
         Nero currently is; elsewhere you can summon him here. Tap it to talk. -->
    {#if neroIsHere && travel !== 'in'}
        <div
            class="presence-orb"
            class:working={!waitingOnUser && (showLoader || (engaged && voiceOrbState !== 'idle'))}
            class:tappable={presenceMode}
            onclick={toggleTalk}
            role="button"
            tabindex="-1"
        >
            <Orb size={132} state={waitingOnUser ? 'idle' : engaged ? voiceOrbState : orbState} />
        </div>
    {:else if !neroIsHere && travel !== 'out'}
        <div class="presence-away" class:is-ambient={amAmbient}>
            <button class="elsewhere" onclick={() => bringNeroHere()}>
                {#if amAmbient}
                    <span class="ambient-orb"><Orb size={116} state="idle" /></span>
                    <span class="elsewhere-text">
                        ambient · tap or say <strong>“Hey Nero”</strong>
                    </span>
                {:else}
                    <span class="ghost-orb"></span>
                    <span class="elsewhere-text">
                        Nero is on <strong>{neroDeviceName ?? 'another screen'}</strong>
                        <span class="bring">bring him here</span>
                    </span>
                {/if}
            </button>
            <button class="ambient-toggle" onclick={toggleAmbient}>
                {amAmbient ? 'stop ambient' : 'make this an ambient display'}
            </button>
        </div>
    {/if}

    <!-- the traveling orb: the ONLY orb shown mid-hop. It flies off one screen and
         (after an off-screen beat) flies into the next, landing exactly where the
         real orb rests so the handoff is seamless. -->
    {#if travel}
        <div class="travel {travel}" aria-hidden="true">
            <Orb size={132} state="idle" />
        </div>
    {/if}

    {#if presenceMode}
        <button class="presence-exit" onclick={exitPresence} aria-label="Exit presence">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        {#if engaged && voiceTools.length}
            <div class="voice-tools">
                <ToolGroup tools={voiceTools} live={voiceToolActive} />
            </div>
        {/if}
        {#if engaged && liveTranscript}
            <div class="voice-transcript">{liveTranscript}</div>
        {/if}
        <div class="voice-hint">
            {#if !engaged}
                tap the orb to talk · <kbd>esc</kbd> to exit
            {:else if voiceState === 'connecting'}connecting…
            {:else if voiceState === 'error'}{insecureContext
                    ? 'voice needs https'
                    : 'voice unavailable'}
            {:else if voicePhase === 'thinking'}thinking…
            {:else if voicePhase === 'speaking'}speaking
            {:else}listening{/if}
            {#if engaged}· <kbd>esc</kbd> to stop{/if}
        </div>
    {/if}

    <header class="bar">
        <div class="mark">
            <span class="wordmark">NERO</span>
            <span class="stat">
                {#if connected}
                    <i class="dot"></i> {myDeviceName}{myTier === 'focus'
                        ? ' · present'
                        : myTier === 'ambient'
                          ? ' · ambient'
                          : ''}
                {:else}
                    <i class="dot off"></i> {connectionError ? 'offline: ' + connectionError.slice(0, 90) : 'connecting'}
                {/if}
            </span>
        </div>
        <div class="bar-actions">
            {#if neroIsHere}
                {#if !presenceMode}
                    <button
                        class="voice-enter"
                        onclick={() => (presenceMode = true)}
                        aria-label="Voice mode"
                        title="Voice mode (⌘↵)"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            width="17"
                            height="17"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.7"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                            <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                            <path d="M12 18v4" />
                        </svg>
                    </button>
                {/if}
                <button
                    class="wake-toggle"
                    class:on={wakewordStatus === 'on'}
                    onclick={toggleWakeword}
                    aria-label="Wakeword"
                    title={wakewordStatus === 'insecure'
                        ? 'Wakeword needs HTTPS'
                        : wakewordStatus === 'on'
                          ? 'Listening for "Hey Nero"'
                          : 'Listen for "Hey Nero"'}
                >
                    <svg
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.7"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
                        <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7" />
                        <path d="M6 6a8 8 0 0 0 0 12M18 6a8 8 0 0 1 0 12" opacity="0.5" />
                    </svg>
                </button>
            {/if}
                <button
                    class="ws-btn"
                    onclick={() => (settingsOpen = true)}
                    aria-label="Settings"
                    title="Settings"
                >
                    <svg
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <circle cx="12" cy="12" r="3" />
                        <path
                            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
                        />
                    </svg>
                </button>
            </div>
    </header>

    <Settings bind:open={settingsOpen} bind:tab={settingsTab} />

    <!-- The interaction surface (chat + composer) lives ONLY where the orb is.
         Other screens show just the device name + the orb hole + any panels. -->
    {#if neroIsHere}
    {#if !hasConversation}
        <div class="hero">
            <p class="tagline">What are we working on?</p>
        </div>
    {:else}
        <div bind:this={scroller} onscroll={onScroll} class="scroller">
            <div class="thread">
                {#each timeline as item (item.key)}
                    {#if item.kind === 'msg'}
                        <Message role={item.role} content={item.content} attachments={item.attachments} />
                    {:else if item.kind === 'event'}
                        <div class="tl-event"><i class="tl-ev-dot"></i>{item.label}</div>
                    {:else}
                        <ToolGroup tools={item.tools} />
                    {/if}
                {/each}

                {#if isRunning && liveActivities.length}
                    <ToolGroup tools={liveActivities} live />
                {/if}

                {#each pendingSteering as text, idx (idx)}
                    <div class="queued-row">
                        <div class="queued"><span class="qtag">queued</span>{text}</div>
                    </div>
                {/each}

                {#each commandNotices as n (n.key)}
                    <div class="cmd-notice" class:error={n.error} transition:fade={{ duration: 250 }}>
                        {n.content}
                    </div>
                {/each}
            </div>
        </div>
    {/if}

    <div class="dockwrap">
        {#if isCompacting}
            <div class="compact-chip" title="Folding older history into memory">
                <span class="cdots"><i></i><i></i><i></i></span>
                compacting memory
            </div>
        {:else if (showLoader || commandLoading) && !askReplacesComposer}
            <div class="statusline">
                {commandLoading ? `${commandLoading}…` : `${loaderText}…`}
            </div>
        {/if}
        {#if !askReplacesComposer}
            <Composer
                onSubmit={handleSend}
                onCommand={handleCommand}
                onAbort={handleStop}
                loading={isRunning}
            />
        {/if}
    </div>
    {/if}

    {#if neroIsHere}<div class="theme-dock"><ThemeSwitch /></div>{/if}
</div>

<style>
    .field {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        /* real visible height (URL-bar / keyboard aware) so the composer never crops */
        height: var(--app-h);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: var(--font-ui);
        color: var(--text);
    }

    .bar {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 28px;
        padding-top: max(20px, var(--safe-t));
        padding-left: max(28px, var(--safe-l));
        padding-right: max(28px, var(--safe-r));
        z-index: 30;
        transition: opacity 0.6s ease;
    }
    @media (max-width: 640px) {
        .bar {
            padding: max(12px, var(--safe-t)) max(16px, var(--safe-r)) 12px max(16px, var(--safe-l));
        }
        .wordmark {
            font-size: 20px;
        }
    }
    .mark {
        display: flex;
        align-items: baseline;
        gap: 14px;
        flex: 1;
    }
    .wordmark {
        font-family: var(--font-display);
        font-size: 24px;
        letter-spacing: 0.16em;
    }
    .stat {
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--text-dim);
        display: inline-flex;
        align-items: center;
        gap: 7px;
    }
    .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: rgb(var(--holo));
        box-shadow: 0 0 8px 1px rgb(var(--holo));
    }
    .dot.off {
        background: #f5a524;
        box-shadow: 0 0 8px 1px rgb(245 165 36 / 0.7);
    }
    .ws {
        text-align: right;
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.06em;
        color: var(--text-dim);
        text-decoration: none;
    }
    .ws-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        background: none;
        border: none;
        color: var(--text-dim);
        cursor: pointer;
        border-radius: 8px;
        transition:
            color 0.2s ease,
            background 0.2s ease;
    }
    .ws-btn:hover {
        color: rgb(var(--holo-soft));
        background: rgb(var(--holo) / 0.08);
    }
    .ws:hover {
        color: var(--text);
    }
    .bar-actions {
        display: flex;
        align-items: center;
        gap: 14px;
    }
    /* Enter the voice canvas from text mode (there's no Cmd+Enter on a phone). */
    .voice-enter {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 1px solid rgb(var(--holo) / 0.22);
        background: rgb(var(--holo) / 0.05);
        color: rgb(var(--holo-soft));
        cursor: pointer;
        flex-shrink: 0;
        transition: background 0.2s, color 0.2s;
    }
    .voice-enter:hover {
        background: rgb(var(--holo) / 0.12);
        color: rgb(var(--holo-hot));
    }
    /* Wakeword arm/disarm. Resting: dim + quiet. Armed: holo + a gentle listening pulse. */
    .wake-toggle {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 1px solid rgb(var(--holo) / 0.16);
        background: transparent;
        color: var(--text-dim);
        cursor: pointer;
        flex-shrink: 0;
        transition:
            background 0.2s,
            color 0.2s,
            border-color 0.2s;
    }
    .wake-toggle:hover {
        color: var(--text);
        border-color: rgb(var(--holo) / 0.3);
    }
    .wake-toggle.on {
        color: rgb(var(--holo-hot));
        border-color: rgb(var(--holo) / 0.5);
        background: rgb(var(--holo) / 0.08);
        animation: wake-pulse 2.4s ease-in-out infinite;
    }
    @keyframes wake-pulse {
        0%,
        100% {
            box-shadow: 0 0 0 0 rgb(var(--holo) / 0.35);
        }
        50% {
            box-shadow: 0 0 0 4px rgb(var(--holo) / 0);
        }
    }

    /* the one orb: ambient in the gutter; glides to center + expands in voice mode */
    .presence-orb {
        position: fixed;
        left: 3.5vw;
        top: 50%;
        transform: translateY(-50%) scale(1);
        transform-origin: center;
        z-index: 5;
        opacity: 0.92;
        pointer-events: none;
        transition:
            left 0.85s cubic-bezier(0.65, 0, 0.2, 1),
            transform 0.85s cubic-bezier(0.65, 0, 0.2, 1),
            opacity 0.6s ease;
    }
    .presence-orb.tappable {
        pointer-events: auto;
        cursor: pointer;
    }
    .presence-orb.working {
        opacity: 1;
    }
    @media (max-width: 1180px) {
        /* The ambient gutter orb is a desktop affordance (there's no side gutter on
           a phone). Below 1180px it only appears in presence mode, centered — so the
           orb never crowds the chat, but never fully vanishes either. */
        .presence-orb {
            display: none;
        }
        .field.presence .presence-orb {
            display: block;
        }
    }

    /* The traveling orb: the only orb on screen mid-hop. It flies off into the
       distance on the screen he leaves, and on the destination it waits off-screen
       (in transit), then flies in from the far edge and grows to land at center —
       ending at the same place/size the real orb rests, for a seamless handoff. */
    .travel {
        position: fixed;
        top: 50%;
        left: 50%;
        z-index: 45;
        pointer-events: none;
        will-change: transform, opacity, filter;
    }
    .travel.in {
        animation: travel-in 1.35s cubic-bezier(0.16, 0.72, 0.18, 1) forwards;
    }
    .travel.out {
        animation: travel-out 0.7s cubic-bezier(0.5, 0, 0.85, 0.35) forwards;
    }
    /* leaves: gathers, then accelerates off the right edge, shrinking into the
       distance toward the next screen. */
    @keyframes travel-out {
        0% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
            filter: brightness(1);
        }
        20% {
            transform: translate(-50%, -50%) scale(1.18);
            opacity: 1;
            filter: brightness(1.55) blur(0);
        }
        100% {
            transform: translate(-50%, -50%) translateX(82vw) scale(0.18);
            opacity: 0;
            filter: brightness(1.4) blur(3px);
        }
    }
    /* arrives: held off-screen left for the first beat (still crossing the gap),
       then streaks in from the far edge, decelerating and growing to rest. */
    @keyframes travel-in {
        0%,
        34% {
            transform: translate(-50%, -50%) translateX(-90vw) scale(0.16);
            opacity: 0;
            filter: brightness(2) blur(4px);
        }
        40% {
            transform: translate(-50%, -50%) translateX(-72vw) scale(0.4);
            opacity: 1;
            filter: brightness(1.8) blur(2px);
        }
        100% {
            transform: translate(-50%, -50%) scale(2.15);
            opacity: 1;
            filter: brightness(1) blur(0);
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .travel {
            display: none;
        }
    }

    /* Nero is on another screen: an empty socket where the orb would be, centered. */
    .presence-away {
        position: fixed;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        z-index: 20;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
    }
    .elsewhere {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
        background: none;
        border: none;
        cursor: pointer;
        color: var(--text-dim);
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.04em;
        text-align: center;
        opacity: 0.4;
        transition: opacity 0.3s ease;
    }
    .elsewhere:hover {
        opacity: 0.75;
    }
    /* ambient tier: Nero isn't focused here but the screen is alive, dimmed orb,
       more presence than a dormant screen, and it's listening for the wakeword. */
    .presence-away.is-ambient .elsewhere {
        opacity: 0.72;
    }
    .ambient-orb {
        opacity: 0.5;
        filter: saturate(0.85);
        transition: opacity 0.3s ease;
        animation: ghost-pulse 6s ease-in-out infinite;
    }
    .presence-away.is-ambient:hover .ambient-orb {
        opacity: 0.82;
    }
    .ambient-toggle {
        background: none;
        border: none;
        cursor: pointer;
        color: var(--text-dim);
        font-family: var(--font-mono);
        font-size: 9px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        opacity: 0.3;
        transition: opacity 0.2s ease;
    }
    .ambient-toggle:hover {
        opacity: 0.7;
    }
    /* a clear hole at the real orb's size: faint ring, recessed dark center */
    .ghost-orb {
        width: 132px;
        height: 132px;
        border-radius: 50%;
        flex-shrink: 0;
        border: 1px dashed rgb(var(--holo) / 0.18);
        background: radial-gradient(circle at 50% 50%, rgb(0 0 0 / 0.55), transparent 72%);
        box-shadow:
            inset 0 0 50px rgb(0 0 0 / 0.7),
            inset 0 0 0 1px rgb(var(--holo) / 0.04);
        animation: ghost-pulse 5s ease-in-out infinite;
    }
    @keyframes ghost-pulse {
        0%,
        100% {
            opacity: 0.6;
        }
        50% {
            opacity: 0.85;
        }
    }
    .elsewhere-text strong {
        color: var(--text-dim);
        font-weight: 600;
    }
    .elsewhere .bring {
        display: block;
        margin-top: 4px;
        color: rgb(var(--holo-soft) / 0.7);
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-size: 9.5px;
    }

    /* voice layout: orb glides to center + expands, chat pushed aside, dock recedes */
    .field.presence .presence-orb {
        left: 50%;
        transform: translate(-50%, -50%) scale(2.15);
        opacity: 1;
    }
    .field.presence .scroller,
    .field.presence .hero {
        transform: translateX(40vw);
        opacity: 0;
        pointer-events: none;
    }
    .field.presence .dockwrap {
        transform: translateY(48px);
        opacity: 0;
        pointer-events: none;
    }
    /* no chrome in voice mode — full canvas for the orb + thrown panels */
    .field.presence .bar,
    .field.presence .theme-dock {
        opacity: 0;
        pointer-events: none;
    }
    /* Touch exit from presence mode (there's no Esc key on a phone). */
    .presence-exit {
        position: fixed;
        top: max(18px, var(--safe-t));
        left: 50%;
        transform: translateX(-50%);
        z-index: 40;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        border: 1px solid rgb(var(--holo) / 0.22);
        background: rgb(var(--holo) / 0.05);
        color: rgb(var(--holo-soft));
        cursor: pointer;
        backdrop-filter: blur(8px);
        opacity: 0.7;
        transition: opacity 0.2s, background 0.2s;
    }
    .presence-exit:hover {
        opacity: 1;
        background: rgb(var(--holo) / 0.12);
    }
    .voice-transcript {
        position: fixed;
        left: 50%;
        /* sit below the expanded orb and grow downward, never over it */
        top: calc(50% + 165px);
        transform: translateX(-50%);
        z-index: 20;
        width: min(640px, 70vw);
        text-align: center;
        font-family: var(--font-display);
        font-size: 24px;
        line-height: 1.4;
        color: var(--text);
        text-shadow: 0 0 30px rgb(var(--holo) / 0.2);
        /* bound it to a few lines so long turns don't reach the hint */
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
        animation: enter 0.3s ease;
    }
    @keyframes enter {
        from { opacity: 0; transform: translate(-50%, 6px); }
        to { opacity: 1; transform: translate(-50%, 0); }
    }
    .voice-hint {
        position: fixed;
        left: 50%;
        bottom: 15%;
        transform: translateX(-50%);
        z-index: 20;
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--text-dim);
        animation: pulse-text 2s ease-in-out infinite;
    }
    .voice-hint kbd {
        background: rgb(var(--holo) / 0.1);
        border: 1px solid rgb(var(--holo) / 0.2);
        border-radius: 4px;
        padding: 1px 5px;
        color: rgb(var(--holo-soft));
    }

    /* live tool cards floating above the orb while Nero acts */
    .voice-tools {
        position: fixed;
        left: 50%;
        bottom: calc(50% + 130px);
        transform: translateX(-50%);
        z-index: 20;
        display: flex;
        justify-content: center;
        width: min(360px, 82vw);
        max-height: 40vh;
        overflow-y: auto;
        animation: enter 0.3s ease;
    }

    .hero {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
        transition: transform 0.85s cubic-bezier(0.65, 0, 0.2, 1), opacity 0.6s ease;
    }
    .tagline {
        font-family: var(--font-display);
        font-size: 24px;
        color: var(--text-dim);
        margin: 0;
    }

    .scroller {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
        touch-action: pan-y;
        z-index: 10;
        transition: transform 0.85s cubic-bezier(0.65, 0, 0.2, 1), opacity 0.6s ease;
    }
    .thread {
        max-width: 760px;
        width: 100%;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 18px;
        padding: 12px 24px 28px;
        /* long words / URLs wrap instead of widening the thread */
        overflow-wrap: anywhere;
    }

    .queued-row {
        display: flex;
        justify-content: flex-end;
        width: 100%;
    }
    .queued {
        max-width: 78%;
        padding: 9px 14px;
        border-radius: 16px 16px 4px 16px;
        background: rgb(var(--holo) / 0.03);
        border: 1px dashed rgb(var(--holo) / 0.22);
        font-size: 13.5px;
        color: var(--text-dim);
    }
    .qtag {
        font-family: var(--font-mono);
        font-size: 9px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--text-faint);
        margin-right: 8px;
    }

    /* a timeline event (a panel interaction, etc.): a quiet centered marker, not a
       chat bubble */
    .tl-event {
        align-self: center;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 4px 12px;
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.06em;
        color: var(--text-faint);
    }
    .tl-ev-dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: rgb(var(--holo) / 0.6);
        box-shadow: 0 0 6px rgb(var(--holo) / 0.5);
    }

    /* local system notice for slash-command output (not part of the conversation) */
    .cmd-notice {
        align-self: center;
        max-width: 80%;
        padding: 8px 14px;
        border-radius: 10px;
        background: rgb(var(--holo) / 0.05);
        border: 1px solid rgb(var(--holo) / 0.18);
        font-family: var(--font-mono);
        font-size: 12.5px;
        color: var(--text-dim);
        text-align: center;
    }
    .cmd-notice.error {
        background: rgb(220 70 70 / 0.08);
        border-color: rgb(220 70 70 / 0.3);
        color: rgb(230 140 140);
    }

    .dockwrap {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        padding: 10px max(20px, var(--safe-r)) max(26px, calc(var(--safe-b) + 14px))
            max(20px, var(--safe-l));
        z-index: 30;
        transition: transform 0.7s cubic-bezier(0.65, 0, 0.2, 1), opacity 0.5s ease;
    }
    .statusline {
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: rgb(var(--holo-soft));
        animation: pulse-text 1.6s ease-in-out infinite;
    }
    @keyframes pulse-text {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.45; }
    }

    /* compaction: a quiet background-bookkeeping chip, deliberately muted vs the
       active thinking statusline (mirrors Pompeii's compacting chip) */
    .compact-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--text-faint);
    }
    .cdots {
        display: inline-flex;
        gap: 3px;
    }
    .cdots i {
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: rgb(var(--holo) / 0.55);
        animation: cdot 1.1s ease-in-out infinite;
    }
    .cdots i:nth-child(2) { animation-delay: 0.18s; }
    .cdots i:nth-child(3) { animation-delay: 0.36s; }
    @keyframes cdot {
        0%, 100% { transform: translateY(0); opacity: 0.4; }
        50% { transform: translateY(-3px); opacity: 1; }
    }

    .theme-dock {
        position: fixed;
        left: 22px;
        bottom: 20px;
        z-index: 40;
        transform: scale(0.92);
        transform-origin: left bottom;
        opacity: 0.7;
        transition: opacity 0.2s;
    }
    .theme-dock:hover {
        opacity: 1;
    }
    @media (max-width: 720px) {
        .theme-dock { display: none; }
    }

    /* Background-project dashboards: a column up the left, clear of the orb + composer. */
    .project-dock {
        position: fixed;
        top: 64px;
        left: 24px;
        z-index: 45;
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-height: calc(var(--app-h) - 140px);
        overflow-y: auto;
        padding-right: 4px;
    }
    @media (max-width: 720px) {
        .project-dock {
            left: 12px;
            right: 12px;
            top: 56px;
        }
    }

    /* ---- phone ---- */
    @media (max-width: 640px) {
        .thread {
            padding: 10px 14px 22px;
            gap: 14px;
        }
        .voice-transcript {
            width: min(640px, 90vw);
            font-size: 20px;
        }
        .tagline {
            font-size: 20px;
            padding: 0 24px;
            text-align: center;
        }
    }
</style>
