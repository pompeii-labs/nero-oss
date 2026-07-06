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
        onResize,
        onClose,
        onMaximize,
        onPoll,
    }: {
        panels: PanelRow[];
        onAction: (panelId: string, action: PanelAction, control: string) => void;
        onMove: (id: string, x: number, y: number) => void;
        onResize: (id: string, w: number, h: number) => void;
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

    // Resize state, mirroring the drag pattern: `liveWH` is the size while resizing,
    // `pinnedWH` holds it briefly after release so it doesn't snap back before Lux
    // propagates the write (which Nero reads via list_panels).
    const MIN_W = 240;
    const MIN_H = 140;
    let resizeId = $state<string | null>(null);
    let liveWH = $state<{ w: number; h: number }>({ w: 0, h: 0 });
    let pinnedWH = $state<Record<string, { w: number; h: number }>>({});
    let startPt = { x: 0, y: 0 };
    let startWH = { w: 0, h: 0 };

    function whOf(p: PanelRow): { w: number; h: number } {
        if (resizeId === p.id) return liveWH;
        return pinnedWH[p.id] ?? { w: p.w ?? 380, h: p.h ?? 300 };
    }
    function startResize(e: PointerEvent, p: PanelRow) {
        if (e.button !== 0 || p.maximized) return;
        const cur = pinnedWH[p.id] ?? { w: p.w ?? 380, h: p.h ?? 300 };
        startWH = { ...cur };
        liveWH = { ...cur };
        startPt = { x: e.clientX, y: e.clientY };
        resizeId = p.id;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
    }
    function onResizeMove(e: PointerEvent) {
        if (!resizeId) return;
        liveWH = {
            w: Math.max(MIN_W, startWH.w + (e.clientX - startPt.x)),
            h: Math.max(MIN_H, startWH.h + (e.clientY - startPt.y)),
        };
    }
    function endResize() {
        if (!resizeId) return;
        const id = resizeId;
        const at = { w: Math.round(liveWH.w), h: Math.round(liveWH.h) };
        pinnedWH[id] = at;
        pinnedWH = { ...pinnedWH };
        onResize(id, at.w, at.h);
        resizeId = null;
        setTimeout(() => {
            delete pinnedWH[id];
            pinnedWH = { ...pinnedWH };
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
            <Panel width={p.maximized ? undefined : whOf(p).w}>
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
                    style={p.maximized ? '' : `max-height:${whOf(p).h}px;`}
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
            {#if !p.maximized}
                <div
                    class="presize"
                    class:active={resizeId === p.id}
                    title="Drag to resize"
                    onpointerdown={(e) => startResize(e, p)}
                    onpointermove={onResizeMove}
                    onpointerup={endResize}
                ></div>
            {/if}
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

    /* Phone: pixel-dragged floating windows make no sense. Panels become a
       full-width stack in a bottom sheet; no drag, no resize. */
    @media (max-width: 640px) {
        .panel-layer {
            inset: auto 0 0 0;
            max-height: 82dvh;
            overflow-y: auto;
            pointer-events: auto;
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 10px 10px calc(var(--safe-b) + 10px);
        }
        .panel-pos,
        .panel-pos.maximized {
            position: relative !important;
            inset: auto !important;
            left: auto !important;
            top: auto !important;
            width: 100% !important;
        }
        .panel-pos :global(.panel) {
            width: 100% !important;
        }
        .panel-body {
            max-height: 60vh !important;
            overflow-y: auto;
        }
        .phdr {
            cursor: default;
            touch-action: auto;
        }
        .presize {
            display: none;
        }
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
    /* Corner resize grip. Persists w/h on release; Nero reads it via list_panels. */
    .presize {
        position: absolute;
        right: 0;
        bottom: 0;
        width: 18px;
        height: 18px;
        cursor: nwse-resize;
        touch-action: none;
        z-index: 3;
    }
    .presize::after {
        content: '';
        position: absolute;
        right: 4px;
        bottom: 4px;
        width: 7px;
        height: 7px;
        border-right: 2px solid rgb(var(--holo) / 0.35);
        border-bottom: 2px solid rgb(var(--holo) / 0.35);
        transition: border-color 0.15s ease;
    }
    .panel-pos:hover .presize::after,
    .presize.active::after {
        border-color: rgb(var(--holo) / 0.75);
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
