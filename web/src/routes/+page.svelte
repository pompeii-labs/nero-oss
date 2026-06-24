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
    import ThemeSwitch from '$lib/components/field/ThemeSwitch.svelte';
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
        type MessageRow,
        type DispatchRow,
    } from '$lib/lux';
    import { sendMessage, cancelDispatch, type AttachmentUpload } from '$lib/actions/nero';
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

    onMount(async () => {
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
            connected = true;
        } catch (e) {
            connectionError = e instanceof Error ? e.message : String(e);
            connected = false;
        }
    });

    onDestroy(() => {
        unsubMessages?.();
        unsubDispatches?.();
    });

    const active = $derived(currentDispatchId ? (dispatchMap[currentDispatchId] ?? null) : null);
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
        | { kind: 'tools'; key: string; tools: ToolActivityType[] };

    const timeline = $derived.by(() => {
        const out: Item[] = [];
        for (const m of msgs) {
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

    // Voice layout (choreography only, no voice hookup yet): Cmd/Ctrl+Enter glides
    // the SAME orb to center + expands it while the chat pushes aside. Esc exits.
    let voiceMode = $state(false);
    $effect(() => {
        function onKey(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                voiceMode = !voiceMode;
            } else if (e.key === 'Escape' && voiceMode) {
                voiceMode = false;
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    // Voice session lifecycle: open on entering voice mode, tear down on exit.
    let voiceSession = $state<VoiceSession | null>(null);
    let voiceState = $state<VoiceState>('idle');
    let liveTranscript = $state('');
    let voicePhase = $state<TurnPhase | null>(null);
    let voiceActivities = $state<VoiceActivity[]>([]);
    $effect(() => {
        if (voiceMode && !voiceSession) {
            startVoice({
                onState: (s) => (voiceState = s),
                onTranscript: (text) => (liveTranscript = text),
                onTurn: (phase) => {
                    voicePhase = phase;
                    // A fresh user turn clears the prior turn's tool trail.
                    if (phase === 'listening' || phase === 'thinking') voiceActivities = [];
                },
                onActivity: (a) => {
                    const i = voiceActivities.findIndex((x) => x.id === a.id);
                    if (i >= 0) voiceActivities[i] = a;
                    else voiceActivities = [...voiceActivities, a];
                },
            })
                .then((s) => (voiceSession = s))
                .catch(() => (voiceState = 'error'));
        } else if (!voiceMode && voiceSession) {
            voiceSession.stop();
            voiceSession = null;
            voiceState = 'idle';
            liveTranscript = '';
            voicePhase = null;
            voiceActivities = [];
        }
    });

    // A voice tool can finish in well under a frame; latch the "tool" look for a
    // short dwell whenever a NEW tool fires so it's actually watchable (the chat
    // orb does the same). The chip shows the latest tool through the dwell.
    const VOICE_TOOL_DWELL = 1100;
    let voiceToolHold = $state(false);
    let voiceToolTimer: ReturnType<typeof setTimeout> | null = null;
    let seenVoiceTools = 0;
    // Derived (not effect-assigned) so it's populated in the SAME render the orb
    // flips to 'tool', no one-frame gap where the chip is blank.
    const voiceToolName = $derived(
        voiceActivities.length
            ? (voiceActivities[voiceActivities.length - 1].details?.display_name ?? 'Working')
            : null,
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

<div class="field" class:voice={voiceMode} data-theme={fieldTheme.dataTheme}>
    <Atmosphere />

    <!-- the one orb: ambient in the gutter, glides to center + expands in voice mode -->
    <div class="presence-orb" class:working={showLoader || (voiceMode && voiceOrbState !== 'idle')}>
        <Orb size={132} state={voiceMode ? voiceOrbState : orbState} />
    </div>

    {#if voiceMode}
        {#if voiceToolActive && voiceToolName}
            <div class="voice-activity">
                <span class="va-pulse"></span>
                {voiceToolName}
            </div>
        {/if}
        {#if liveTranscript}
            <div class="voice-transcript">{liveTranscript}</div>
        {/if}
        <div class="voice-hint">
            {#if voiceState === 'connecting'}connecting…{:else if voiceState === 'error'}voice unavailable{:else if voicePhase === 'thinking'}thinking…{:else if voicePhase === 'speaking'}speaking{:else}listening{/if}
            · <kbd>esc</kbd> to exit
        </div>
    {/if}

    <header class="bar">
        <div class="mark">
            <span class="wordmark">NERO</span>
            <span class="stat">
                {#if connected}
                    <i class="dot"></i> field · present
                {:else}
                    <i class="dot off"></i> {connectionError ? 'offline' : 'connecting'}
                {/if}
            </span>
        </div>
        <a class="ws" href="/protocols">Protocols</a>
    </header>

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
        {:else if showLoader || commandLoading}
            <div class="statusline">
                {commandLoading ? `${commandLoading}…` : `${loaderText}…`}
            </div>
        {/if}
        <Composer
            onSubmit={handleSend}
            onCommand={handleCommand}
            onAbort={handleStop}
            loading={isRunning}
        />
    </div>

    <div class="theme-dock"><ThemeSwitch /></div>
</div>

<style>
    .field {
        position: fixed;
        inset: 0;
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
        z-index: 30;
        transition: opacity 0.6s ease;
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
    .ws:hover {
        color: var(--text);
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
    .presence-orb.working {
        opacity: 1;
    }
    @media (max-width: 1180px) {
        .presence-orb { display: none; }
    }

    /* voice layout: orb glides to center + expands, chat pushed aside, dock recedes */
    .field.voice .presence-orb {
        left: 50%;
        transform: translate(-50%, -50%) scale(2.15);
        opacity: 1;
    }
    .field.voice .scroller,
    .field.voice .hero {
        transform: translateX(40vw);
        opacity: 0;
        pointer-events: none;
    }
    .field.voice .dockwrap {
        transform: translateY(48px);
        opacity: 0;
        pointer-events: none;
    }
    /* no chrome in voice mode — full canvas for the orb + thrown panels */
    .field.voice .bar,
    .field.voice .theme-dock {
        opacity: 0;
        pointer-events: none;
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

    /* live tool readout: a holo chip floating above the orb while Nero acts */
    .voice-activity {
        position: fixed;
        left: 50%;
        top: calc(50% - 150px);
        transform: translateX(-50%);
        z-index: 20;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 14px;
        border: 1px solid rgb(var(--holo) / 0.28);
        border-radius: 999px;
        background: rgb(var(--holo) / 0.06);
        backdrop-filter: blur(8px);
        box-shadow: 0 0 24px rgb(var(--holo) / 0.12);
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: rgb(var(--holo-soft));
        white-space: nowrap;
        animation: enter 0.3s ease;
    }
    .va-pulse {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: rgb(var(--holo));
        box-shadow: 0 0 8px rgb(var(--holo));
        animation: va-blink 1.1s ease-in-out infinite;
    }
    @keyframes va-blink {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.35; transform: scale(0.7); }
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
        padding: 10px 20px 26px;
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
</style>
