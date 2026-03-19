<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { getServerUrl, get } from '$lib/actions/helpers';
    import AmbientCard from './ambient-card.svelte';
    import AmbientLog from './ambient-log.svelte';
    import ArrowLeftToLine from '@lucide/svelte/icons/arrow-left-to-line';

    interface Props {
        interfaceId: string;
        displayName: string;
        neroIsHere: boolean;
        onNudge: () => void;
    }

    let { interfaceId, displayName, neroIsHere, onNudge }: Props = $props();

    let time = $state('');
    let date = $state('');
    let activeCardId = $state<string | null>(null);
    let cards = $state<any[]>([]);
    let autonomyLog = $state<any[]>([]);
    let autonomyStatus = $state<string>('disabled');
    let nextWakeTime = $state<number | null>(null);
    let activeProjectCount = $state<number>(0);
    let eventSource: EventSource | null = null;
    let localClockTimer: ReturnType<typeof setInterval> | null = null;
    let localTime24 = $state('');
    let localDate24 = $state('');

    const activeCard = $derived(
        activeCardId ? cards.find((c: any) => c.id === activeCardId) ?? null : null
    );

    const wakeCountdown = $derived.by(() => {
        if (!nextWakeTime) return null;
        const diff = nextWakeTime - Date.now();
        if (diff <= 0) return null;
        const totalMin = Math.floor(diff / 60_000);
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    });

    const autonomyLabel = $derived(
        autonomyStatus === 'active' ? 'ACTIVE' :
        autonomyStatus === 'sleeping' ? 'SLEEPING' : 'DISABLED'
    );

    onMount(() => {
        updateLocalClock();
        localClockTimer = setInterval(updateLocalClock, 1000);
        loadInitialState();
        connectSSE();
    });

    async function loadInitialState() {
        const res = await get<any>(`/api/interfaces/${interfaceId}`);
        if (!res.success || !res.data?.state) return;
        const s = res.data.state;
        if (s.cards) cards = s.cards;
        if (s.activeCard) activeCardId = s.activeCard;
        if (s.autonomyLog) autonomyLog = s.autonomyLog;
        if (s.autonomyStatus) autonomyStatus = s.autonomyStatus;
        if (s.nextWakeTime !== undefined) nextWakeTime = s.nextWakeTime;
        if (s.activeProjectCount !== undefined) activeProjectCount = s.activeProjectCount;
    }

    onDestroy(() => {
        if (localClockTimer) clearInterval(localClockTimer);
        eventSource?.close();
    });

    function updateLocalClock() {
        const now = new Date();
        localTime24 = now.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });
        localDate24 = now.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
        }).toUpperCase();
    }

    function connectSSE() {
        const url = getServerUrl(`/api/interfaces/${interfaceId}/events`);
        eventSource = new EventSource(url);

        eventSource.onmessage = (event) => {
            if (!event.data || event.data === '{}') return;
            try {
                const parsed = JSON.parse(event.data);
                if (parsed.type === 'state_change') {
                    if (parsed.key === 'time') time = parsed.value;
                    if (parsed.key === 'date') date = parsed.value;
                    if (parsed.key === 'activeCard') activeCardId = parsed.value;
                    if (parsed.key === 'cards') cards = parsed.value || [];
                    if (parsed.key === 'autonomyLog') autonomyLog = parsed.value || [];
                    if (parsed.key === 'autonomyStatus') autonomyStatus = parsed.value;
                    if (parsed.key === 'nextWakeTime') nextWakeTime = parsed.value;
                    if (parsed.key === 'activeProjectCount') activeProjectCount = parsed.value;
                }
                if (parsed.type === 'close') {
                    eventSource?.close();
                }
            } catch {}
        };

        eventSource.onerror = () => {
            eventSource?.close();
            eventSource = null;
            setTimeout(connectSSE, 5000);
        };
    }
</script>

<div class="hud-root">
    <div class="ambient-glow"></div>
    <div class="noise-overlay"></div>
    <div class="scanline"></div>

    <div class="corner corner-tl"></div>
    <div class="corner corner-tr"></div>
    <div class="corner corner-bl"></div>
    <div class="corner corner-br"></div>

    <div class="hud-header">
        <div class="header-left">
            <span class="nero-label">NERO</span>
            <div class="status-indicator">
                <div class="status-dot" class:active={neroIsHere}></div>
                <span class="status-text">{neroIsHere ? 'ACTIVE' : 'STANDBY'}</span>
            </div>
        </div>
        <div class="header-right">
            <span class="hud-clock">{localTime24}</span>
            <span class="hud-date">{localDate24}</span>
        </div>
    </div>

    <div class="hud-center">
        {#if activeCard}
            <div class="card-section">
                <AmbientCard card={activeCard} />
            </div>
        {/if}

        {#if !neroIsHere}
            <button type="button" class="nudge-btn" onclick={onNudge}>
                <ArrowLeftToLine class="h-4 w-4" />
                <span>Draw Nero here</span>
            </button>
        {/if}
    </div>

    <div class="hud-footer">
        <div class="footer-left">
            {#if autonomyLog.length > 0}
                <AmbientLog entries={autonomyLog} />
            {/if}
        </div>

        {#if autonomyStatus !== 'disabled'}
            <div class="autonomy-panel">
                <div class="panel-header">AUTONOMY</div>
                <div class="panel-row">
                    <span class="panel-label">Status</span>
                    <span class="panel-value" class:panel-active={autonomyStatus === 'active'}>
                        {autonomyLabel}
                    </span>
                </div>
                {#if wakeCountdown}
                    <div class="panel-row">
                        <span class="panel-label">Wake</span>
                        <span class="panel-value">{wakeCountdown}</span>
                    </div>
                {/if}
                {#if activeProjectCount > 0}
                    <div class="panel-row">
                        <span class="panel-label">Projects</span>
                        <span class="panel-value">{activeProjectCount}</span>
                    </div>
                {/if}
            </div>
        {/if}
    </div>

    <div class="display-tag">{displayName}</div>
</div>

<style>
    .hud-root {
        position: absolute;
        inset: 0;
        overflow: hidden;
        background: #060809;
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
    }

    .ambient-glow {
        position: absolute;
        inset: 0;
        background:
            radial-gradient(ellipse 80% 60% at 50% 30%, color-mix(in oklch, var(--nero-blue, #4d94ff) 4%, transparent), transparent 60%),
            radial-gradient(ellipse 50% 40% at 80% 80%, color-mix(in oklch, var(--nero-cyan, #33ccff) 2%, transparent), transparent 50%);
        animation: glowShift 20s ease-in-out infinite alternate;
    }

    .noise-overlay {
        position: absolute;
        inset: 0;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
        opacity: 0.03;
        pointer-events: none;
        mix-blend-mode: overlay;
    }

    .scanline {
        position: absolute;
        left: 0;
        right: 0;
        height: 2px;
        background: linear-gradient(90deg, transparent, color-mix(in oklch, var(--nero-blue, #4d94ff) 8%, transparent), transparent);
        animation: scanMove 8s linear infinite;
        pointer-events: none;
        z-index: 5;
    }

    .corner {
        position: absolute;
        width: 40px;
        height: 40px;
        z-index: 3;
        pointer-events: none;
    }

    .corner-tl {
        top: 16px;
        left: 16px;
        border-top: 1px solid color-mix(in oklch, var(--nero-blue, #4d94ff) 25%, transparent);
        border-left: 1px solid color-mix(in oklch, var(--nero-blue, #4d94ff) 25%, transparent);
    }

    .corner-tr {
        top: 16px;
        right: 16px;
        border-top: 1px solid color-mix(in oklch, var(--nero-blue, #4d94ff) 25%, transparent);
        border-right: 1px solid color-mix(in oklch, var(--nero-blue, #4d94ff) 25%, transparent);
    }

    .corner-bl {
        bottom: 16px;
        left: 16px;
        border-bottom: 1px solid color-mix(in oklch, var(--nero-blue, #4d94ff) 25%, transparent);
        border-left: 1px solid color-mix(in oklch, var(--nero-blue, #4d94ff) 25%, transparent);
    }

    .corner-br {
        bottom: 16px;
        right: 16px;
        border-bottom: 1px solid color-mix(in oklch, var(--nero-blue, #4d94ff) 25%, transparent);
        border-right: 1px solid color-mix(in oklch, var(--nero-blue, #4d94ff) 25%, transparent);
    }

    .hud-header {
        position: absolute;
        top: 28px;
        left: 32px;
        right: 32px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        z-index: 4;
    }

    .header-left {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .nero-label {
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.2em;
        color: var(--nero-blue, #4d94ff);
        opacity: 0.7;
    }

    .status-indicator {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--nero-blue, #4d94ff);
        box-shadow: 0 0 8px color-mix(in oklch, var(--nero-blue, #4d94ff) 50%, transparent);
        animation: dotPulse 3s ease-in-out infinite;
    }

    .status-dot.active {
        background: #33ff88;
        box-shadow: 0 0 8px color-mix(in oklch, #33ff88 50%, transparent);
    }

    .status-text {
        font-size: 10px;
        font-weight: 500;
        letter-spacing: 0.15em;
        color: color-mix(in oklch, var(--foreground, #e0e5ed) 40%, transparent);
    }

    .header-right {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
    }

    .hud-clock {
        font-size: clamp(36px, 6vw, 56px);
        font-weight: 300;
        color: var(--foreground, #e0e5ed);
        line-height: 1;
        letter-spacing: 0.02em;
        filter: drop-shadow(0 0 12px color-mix(in oklch, var(--nero-blue, #4d94ff) 10%, transparent));
    }

    .hud-date {
        font-size: 11px;
        font-weight: 400;
        color: color-mix(in oklch, var(--muted-foreground, #6b7a8d) 70%, transparent);
        letter-spacing: 0.1em;
    }

    .hud-center {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 24px;
        z-index: 2;
        padding: 120px 24px;
    }

    .card-section {
        width: 100%;
        max-width: 400px;
        animation: fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .nudge-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 20px;
        border-radius: 8px;
        background: color-mix(in oklch, var(--nero-blue, #4d94ff) 6%, transparent);
        border: 1px solid color-mix(in oklch, var(--nero-blue, #4d94ff) 15%, transparent);
        color: var(--nero-blue, #4d94ff);
        font-size: 12px;
        font-weight: 500;
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        cursor: pointer;
        transition: all 0.2s;
        letter-spacing: 0.05em;
    }

    .nudge-btn:hover {
        background: color-mix(in oklch, var(--nero-blue, #4d94ff) 12%, transparent);
        border-color: color-mix(in oklch, var(--nero-blue, #4d94ff) 25%, transparent);
    }

    .hud-footer {
        position: absolute;
        bottom: 28px;
        left: 32px;
        right: 32px;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        z-index: 4;
        pointer-events: none;
    }

    .footer-left {
        flex: 1;
        min-width: 0;
        max-width: 60%;
    }

    .autonomy-panel {
        border: 1px solid color-mix(in oklch, var(--nero-blue, #4d94ff) 18%, transparent);
        border-radius: 4px;
        padding: 10px 14px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 140px;
        background: color-mix(in oklch, #060809 80%, transparent);
        backdrop-filter: blur(4px);
    }

    .panel-header {
        font-size: 9px;
        font-weight: 600;
        letter-spacing: 0.18em;
        color: color-mix(in oklch, var(--nero-blue, #4d94ff) 60%, transparent);
        padding-bottom: 4px;
        border-bottom: 1px solid color-mix(in oklch, var(--nero-blue, #4d94ff) 10%, transparent);
    }

    .panel-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
    }

    .panel-label {
        font-size: 10px;
        color: color-mix(in oklch, var(--muted-foreground, #6b7a8d) 60%, transparent);
        letter-spacing: 0.05em;
    }

    .panel-value {
        font-size: 10px;
        color: var(--foreground, #e0e5ed);
        letter-spacing: 0.05em;
    }

    .panel-value.panel-active {
        color: #33ff88;
    }

    .display-tag {
        position: absolute;
        bottom: 28px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 9px;
        font-weight: 500;
        color: color-mix(in oklch, var(--muted-foreground, #6b7a8d) 30%, transparent);
        letter-spacing: 0.15em;
        z-index: 3;
    }

    @keyframes glowShift {
        0% { opacity: 0.8; }
        100% { opacity: 1; }
    }

    @keyframes dotPulse {
        0%, 100% { opacity: 0.6; }
        50% { opacity: 1; }
    }

    @keyframes fadeUp {
        0% { opacity: 0; transform: translateY(10px); }
        100% { opacity: 1; transform: translateY(0); }
    }

    @keyframes scanMove {
        0% { top: -2px; }
        100% { top: 100%; }
    }
</style>
