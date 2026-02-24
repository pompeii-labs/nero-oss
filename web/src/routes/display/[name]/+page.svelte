<script lang="ts">
    import { page } from '$app/stores';
    import { onMount, onDestroy } from 'svelte';
    import { getServerUrl, get, post } from '$lib/actions/helpers';
    import DisplayPanel from '$lib/components/interface/display-panel.svelte';
    import { voice } from '$lib/stores/voice.svelte';
    import NeroSphere from '$lib/components/nero-sphere.svelte';
    import Monitor from '@lucide/svelte/icons/monitor';
    import Mic from '@lucide/svelte/icons/mic';
    import MicOff from '@lucide/svelte/icons/mic-off';
    import PhoneOff from '@lucide/svelte/icons/phone-off';
    import Volume2 from '@lucide/svelte/icons/volume-2';
    import ArrowLeftToLine from '@lucide/svelte/icons/arrow-left-to-line';
    import MonitorSmartphone from '@lucide/svelte/icons/monitor-smartphone';

    const displayName = $derived($page.params.name ?? '');

    let panels = $state<Map<string, any>>(new Map());
    let eventSource: EventSource | null = null;
    let deviceId = $state('');
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let neroDisplay = $state('main');

    onMount(async () => {
        deviceId = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).slice(2);
        connectSSE();
        loadExisting();
        const res = await get<{ display: string }>('/api/presence');
        if (res.success) neroDisplay = res.data.display;
    });

    onDestroy(() => {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        eventSource?.close();
    });

    async function loadExisting() {
        const result = await get<any[]>('/api/interfaces');
        if (!result.success) return;
        for (const iface of result.data) {
            if (!iface.targetDevice || iface.targetDevice === displayName) {
                panels = new Map([...panels, [iface.id, iface]]);
            }
        }
    }

    function connectSSE() {
        const url = getServerUrl(
            `/api/interfaces/events?device=${encodeURIComponent(deviceId)}&name=${encodeURIComponent(displayName)}`
        );
        eventSource = new EventSource(url);

        eventSource.onmessage = (event) => {
            if (!event.data || event.data === '{}') return;
            try {
                const parsed = JSON.parse(event.data);

                if (parsed.type === 'opened' && parsed.iface) {
                    panels = new Map([...panels, [parsed.iface.id, parsed.iface]]);
                }

                if (parsed.type === 'closed' && parsed.id) {
                    const next = new Map(panels);
                    next.delete(parsed.id);
                    panels = next;
                }

                if (parsed.type === 'presence' && parsed.display) {
                    neroDisplay = parsed.display;
                }

                if (parsed.type === 'voice_migrate' && parsed.targetDevice) {
                    if (parsed.targetDevice === displayName) {
                        if (voice.status === 'idle') voice.connectAsTarget();
                    } else if (voice.isConnected) {
                        voice.migrateAway(parsed.targetDevice);
                    }
                }

                if (parsed.type === 'moved') {
                    const isTarget =
                        parsed.toDevice === displayName || parsed.toDevice === deviceId;
                    const isSource =
                        parsed.fromDevice === displayName || parsed.fromDevice === deviceId;

                    if (isSource && !isTarget) {
                        const next = new Map(panels);
                        next.delete(parsed.id);
                        panels = next;
                    } else if (isTarget && !panels.has(parsed.id)) {
                        get<any>(`/api/interfaces/${parsed.id}`).then((res) => {
                            if (res.success) {
                                panels = new Map([...panels, [parsed.id, res.data]]);
                            }
                        });
                    }
                }
            } catch {}
        };

        eventSource.onerror = () => {
            eventSource?.close();
            eventSource = null;
            reconnectTimer = setTimeout(connectSSE, 5000);
        };
    }

    function closePanel(id: string) {
        const next = new Map(panels);
        next.delete(id);
        panels = next;
    }

    async function nudgeHere() {
        const res = await post<{ display: string }>('/api/presence', { display: displayName });
        if (res.success) neroDisplay = res.data.display;
    }

    const neroIsHere = $derived(neroDisplay === displayName);
</script>

<svelte:head>
    <title>Nero - {displayName}</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="theme-color" content="#080a0d" />
    <meta name="color-scheme" content="dark" />
</svelte:head>

<div class="display-canvas">
    {#if neroIsHere || voice.migrating === 'departing'}
        {#if voice.isConnected || voice.migrating === 'departing'}
            <div class="voice-overlay {voice.migrating === 'departing' ? 'migrate-depart' : ''} {voice.migrating === 'arriving' ? 'migrate-arrive' : ''}">
                <div class="w-[250px] h-[250px]">
                    <NeroSphere
                        status={voice.status}
                        rmsLevel={voice.rmsLevel}
                        isTalking={voice.isTalking}
                        isProcessing={voice.isProcessing}
                        isMuted={voice.isMuted}
                        outputRms={voice.outputRms}
                        onclick={() => {}}
                    />
                </div>
                {#if voice.transcript}
                    <p class="text-sm text-muted-foreground/60 mt-4 max-w-md text-center">{voice.transcript}</p>
                {/if}
                {#if voice.audioSuspended}
                    <button
                        type="button"
                        onclick={voice.resumeAudio}
                        class="audio-enable-btn mt-6"
                    >
                        <Volume2 class="h-4 w-4" />
                        <span>Tap to enable audio</span>
                    </button>
                {:else}
                    <div class="flex items-center gap-3 mt-6">
                        <button
                            type="button"
                            onclick={voice.toggleMute}
                            class="flex h-11 w-11 items-center justify-center rounded-full transition-all {voice.isMuted ? 'bg-red-500/20 border border-red-500/40 text-red-400' : 'bg-card/50 border border-border/50 text-primary hover:border-primary/40'}"
                        >
                            {#if voice.isMuted}
                                <MicOff class="h-5 w-5" />
                            {:else}
                                <Mic class="h-5 w-5" />
                            {/if}
                        </button>
                        <button
                            type="button"
                            onclick={voice.disconnect}
                            class="flex h-11 w-11 items-center justify-center rounded-full bg-red-500/20 border border-red-500/40 text-red-400 transition-all hover:bg-red-500/30"
                        >
                            <PhoneOff class="h-5 w-5" />
                        </button>
                    </div>
                {/if}
            </div>
        {:else if panels.size === 0}
            <div class="empty-state">
                <div class="empty-icon">
                    <Monitor class="h-10 w-10 text-primary/40" />
                </div>
                <h2 class="text-lg font-medium text-foreground/70 mt-4">{displayName}</h2>
                <p class="text-sm text-muted-foreground/50 mt-1">Nero is here. Waiting for interfaces...</p>
                <div class="flex items-center gap-2 mt-4 text-xs text-muted-foreground/30">
                    <div class="w-1.5 h-1.5 rounded-full bg-green-500/60 animate-pulse"></div>
                    <span>Connected as display</span>
                </div>
            </div>
        {:else}
            <div class="panels-grid">
                {#each [...panels.values()] as schema (schema.id)}
                    <DisplayPanel {schema} onClose={closePanel} />
                {/each}
            </div>
        {/if}
    {:else}
        <div class="empty-state">
            <div class="empty-icon">
                <MonitorSmartphone class="h-10 w-10 text-primary/40" />
            </div>
            <h2 class="text-lg font-medium text-foreground/70 mt-4">{displayName}</h2>
            <p class="text-sm text-muted-foreground/50 mt-2">Nero is on <span class="text-primary/70 font-medium">{neroDisplay}</span></p>
            <button
                type="button"
                onclick={nudgeHere}
                class="flex items-center gap-2 mt-5 px-5 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm font-medium transition-all hover:bg-primary/20 hover:border-primary/30"
            >
                <ArrowLeftToLine class="h-4 w-4" />
                <span>Draw Nero here</span>
            </button>
            <div class="flex items-center gap-2 mt-4 text-xs text-muted-foreground/30">
                <div class="w-1.5 h-1.5 rounded-full bg-green-500/60 animate-pulse"></div>
                <span>Connected as display</span>
            </div>
        </div>
    {/if}
</div>

<style>
    .display-canvas {
        width: 100vw;
        height: 100vh;
        background: var(--background);
        overflow: auto;
        position: relative;
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        text-align: center;
    }

    .empty-icon {
        width: 80px;
        height: 80px;
        border-radius: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--primary) 5%, transparent);
        border: 1px solid color-mix(in srgb, var(--primary) 10%, transparent);
    }

    .voice-overlay {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        text-align: center;
    }

    .migrate-depart {
        animation: slideOut 0.6s cubic-bezier(0.4, 0, 0.6, 1) forwards;
    }

    .migrate-arrive {
        animation: slideIn 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }

    @keyframes slideOut {
        0% { transform: translateX(0); opacity: 1; }
        100% { transform: translateX(110%); opacity: 0; }
    }

    @keyframes slideIn {
        0% { transform: translateX(-110%); opacity: 0; }
        100% { transform: translateX(0); opacity: 1; }
    }

    .panels-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        padding: 24px;
        align-items: flex-start;
    }

    .audio-enable-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 20px;
        border-radius: 12px;
        background: color-mix(in srgb, var(--primary) 10%, transparent);
        border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent);
        color: var(--primary);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        animation: pulse-glow 2s ease-in-out infinite;
    }

    .audio-enable-btn:hover {
        background: color-mix(in srgb, var(--primary) 20%, transparent);
        border-color: color-mix(in srgb, var(--primary) 40%, transparent);
    }

    @keyframes pulse-glow {
        0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--primary) 20%, transparent); }
        50% { box-shadow: 0 0 20px 4px color-mix(in srgb, var(--primary) 15%, transparent); }
    }
</style>
