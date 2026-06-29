<script lang="ts">
    import { onDestroy } from 'svelte';
    import Panel from './Panel.svelte';
    import PanelComponent from './PanelComponent.svelte';
    import type { PanelRow } from '$lib/lux';
    import type { Comp, PanelAction } from '$lib/panels/types';
    import { desiredPolls, reconcilePolls } from '$lib/panels/poll';

    let {
        panels,
        onAction,
        onMove,
        onClose,
        onMaximize,
        onPoll,
    }: {
        panels: PanelRow[];
        onAction: (panelId: string, action: PanelAction, control: string) => void;
        onMove: (id: string, x: number, y: number) => void;
        onClose: (id: string) => void;
        onMaximize: (id: string, on: boolean) => void;
        onPoll: (id: string, fn: string) => void;
    } = $props();

    // Auto-refresh: any panel function with everyMs runs on that interval while the
    // panel is on screen. We reconcile timers by panel+fn+everyMs so a state update
    // (which re-emits the row) never tears down a running interval or double-fires.
    const timers = new Map<string, { everyMs: number; id: ReturnType<typeof setInterval> }>();
    $effect(() => {
        const want = desiredPolls(panels);
        const running = new Map([...timers].map(([k, t]) => [k, t.everyMs] as const));
        const { stop, start } = reconcilePolls(want, running);
        for (const key of stop) {
            const t = timers.get(key);
            if (t) clearInterval(t.id);
            timers.delete(key);
        }
        for (const d of start) {
            onPoll(d.pid, d.fn);
            timers.set(`${d.pid}:${d.fn}`, {
                everyMs: d.everyMs,
                id: setInterval(() => onPoll(d.pid, d.fn), d.everyMs),
            });
        }
    });
    onDestroy(() => {
        for (const t of timers.values()) clearInterval(t.id);
    });

    // Drag state. `live` is the position while dragging; `pinned` holds the
    // committed position briefly after drop so it doesn't snap back to the stale
    // server value before Lux propagates ours.
    let dragId = $state<string | null>(null);
    let live = $state<{ x: number; y: number }>({ x: 0, y: 0 });
    let pinned = $state<Record<string, { x: number; y: number }>>({});
    let offset = { x: 0, y: 0 };

    function posOf(p: PanelRow): { x: number; y: number } {
        if (dragId === p.id) return live;
        return pinned[p.id] ?? { x: p.x ?? 40, y: p.y ?? 40 };
    }

    function startDrag(e: PointerEvent, p: PanelRow) {
        if (e.button !== 0 || p.maximized) return;
        const cur = pinned[p.id] ?? { x: p.x ?? 40, y: p.y ?? 40 };
        live = { ...cur };
        offset = { x: e.clientX - cur.x, y: e.clientY - cur.y };
        dragId = p.id;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
    }
    function onDragMove(e: PointerEvent) {
        if (!dragId) return;
        live = { x: Math.max(0, e.clientX - offset.x), y: Math.max(0, e.clientY - offset.y) };
    }
    function endDrag() {
        if (!dragId) return;
        const id = dragId;
        const at = { ...live };
        pinned[id] = at;
        pinned = { ...pinned };
        onMove(id, at.x, at.y);
        dragId = null;
        setTimeout(() => {
            delete pinned[id];
            pinned = { ...pinned };
        }, 1500);
    }
</script>

<div class="panel-layer">
    {#each panels as p (p.id)}
        {@const pos = posOf(p)}
        <div
            class="panel-pos"
            class:maximized={p.maximized}
            style={p.maximized
                ? `z-index:99;`
                : `left:${pos.x}px; top:${pos.y}px; z-index:${(p.z ?? 0) + 1};`}
        >
            <Panel width={p.maximized ? undefined : (p.w ?? 380)}>
                <header
                    class="phdr"
                    class:dragging={dragId === p.id}
                    onpointerdown={(e) => startDrag(e, p)}
                    onpointermove={onDragMove}
                    onpointerup={endDrag}
                >
                    <i class="phdot"></i>
                    <span class="phtitle">{p.title ?? ''}</span>
                    <button
                        class="phbtn"
                        title={p.maximized ? 'Restore' : 'Maximize'}
                        onpointerdown={(e) => e.stopPropagation()}
                        onclick={() => onMaximize(p.id, !p.maximized)}>{p.maximized ? '⤡' : '⤢'}</button
                    >
                    <button
                        class="phclose"
                        title="Dismiss"
                        onpointerdown={(e) => e.stopPropagation()}
                        onclick={() => onClose(p.id)}>×</button
                    >
                </header>
                <div
                    class="panel-body"
                    style={p.maximized ? '' : p.h ? `max-height:${p.h}px;` : ''}
                >
                    {#each p.components ?? [] as c, i (i)}
                        <PanelComponent
                            node={c as Comp}
                            state={p.state ?? {}}
                            onAction={(a, control) => onAction(p.id, a, control)}
                        />
                    {/each}
                </div>
            </Panel>
        </div>
    {/each}
</div>

<style>
    .panel-layer {
        position: fixed;
        inset: 0;
        z-index: 35;
        pointer-events: none;
    }
    .panel-pos {
        position: absolute;
        pointer-events: auto;
        animation: panel-in 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    /* Maximized: fill the Field (leaving the top chrome and a small margin). */
    .panel-pos.maximized {
        left: 24px;
        right: 24px;
        top: 84px;
        bottom: 24px;
    }
    .panel-pos.maximized :global(.panel) {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
    }
    .panel-pos.maximized :global(.panel > .pbody) {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }
    .panel-pos.maximized .panel-body {
        flex: 1;
        min-height: 0;
    }
    .phdr {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: -2px -2px 10px;
        padding: 2px 0 8px;
        cursor: grab;
        border-bottom: 1px solid rgb(var(--holo) / 0.12);
        touch-action: none;
    }
    .phdr.dragging {
        cursor: grabbing;
    }
    .phdot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: rgb(var(--holo));
        box-shadow: 0 0 6px rgb(var(--holo));
        flex-shrink: 0;
    }
    .phtitle {
        flex: 1;
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--text-dim);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .phclose,
    .phbtn {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        line-height: 1;
        font-size: 17px;
        border: none;
        background: none;
        color: var(--text-faint);
        cursor: pointer;
        border-radius: 5px;
        transition:
            color 0.15s ease,
            background 0.15s ease;
    }
    .phbtn {
        font-size: 12px;
    }
    .phclose:hover,
    .phbtn:hover {
        color: var(--text);
        background: rgb(var(--holo) / 0.12);
    }
    .panel-body {
        display: flex;
        flex-direction: column;
        gap: 12px;
        overflow-y: auto;
    }
    @keyframes panel-in {
        from {
            opacity: 0;
            transform: translateY(8px) scale(0.98);
        }
        to {
            opacity: 1;
            transform: none;
        }
    }
</style>
