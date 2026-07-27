<script lang="ts">
    // The dial. Eight wedges around the orb, 0 at twelve o'clock going clockwise.
    // Each wedge is either a built-in capability the Field owns or an action Nero
    // authored. An empty wedge is a prompt: press it and ask for the button you want.
    //
    // Pointer position picks the wedge (a real radial menu, not eight buttons), so
    // you can open it with a long press and release on your target in one gesture.
    import { untrack } from 'svelte';
    import { dialIcon } from './dial-icons';
    import { sfx } from '$lib/audio/sfx';
    import { SLOTS, type Wedge } from '$lib/actions/dial';

    let {
        open = false,
        size = 560,
        wedges = [] as (Wedge | null)[],
        status = '',
        dragging = false,
        onFire,
        onEmpty,
        onClose,
    }: {
        open?: boolean;
        size?: number;
        wedges?: (Wedge | null)[];
        status?: string;
        /** True when the dial opened under a finger still on the glass, so the same
         *  press can drag to a wedge and fire it on release. */
        dragging?: boolean;
        onFire: (w: Wedge) => void;
        /** A slot wants the picker: an empty one pressed, or a filled one held. */
        onEmpty: (slot: number) => void;
        onClose: () => void;
    } = $props();

    // viewBox geometry. The hole clears the orb; the ring carries the wedges.
    const VB = 200;
    const C = VB / 2;
    const R_IN = 52;
    const R_OUT = 96;
    const R_LABEL = (R_IN + R_OUT) / 2;
    const STEP = 360 / SLOTS;
    const GAP = 2.2; // degrees trimmed off each side so wedges read as separate

    let hot = $state<number | null>(null);
    let armed = $state<number | null>(null); // a confirm wedge waiting on its second press
    let dialEl = $state<HTMLElement | null>(null);
    /** Holding on a filled wedge (rather than releasing) opens its picker, so a bound
     *  slot can be swapped or cleared with the same gesture that made it. */
    const HOLD_TO_EDIT_MS = 600;
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    let heldOpen = false;
    /** Captured once at open. Reading the live prop would race the orb's own pointerup,
     *  which clears it before the release handler runs. */
    let dragLatch = false;
    /** Set when a drag-release fired a wedge, so the synthetic click that follows on
     *  the same gesture doesn't fire it a second time. */
    let swallowClick = false;

    function polar(r: number, deg: number): [number, number] {
        const a = ((deg - 90) * Math.PI) / 180;
        return [C + r * Math.cos(a), C + r * Math.sin(a)];
    }

    /** Corner softness on each wedge, in viewBox units. Rounded because a hard-cornered
     *  sector reads as a flat shape rather than a piece of material. */
    const CR = 5;

    /** Rounded annular sector path for slot `i`. */
    function wedgePath(i: number): string {
        const mid = i * STEP;
        const a0 = mid - STEP / 2 + GAP;
        const a1 = mid + STEP / 2 - GAP;
        // clamp so the fillet never eats the band or the arc
        const half = ((a1 - a0) / 2) * (Math.PI / 180);
        const cr = Math.min(CR, (R_OUT - R_IN) / 2.2, R_IN * half * 0.8);
        const dOut = (cr / R_OUT) * (180 / Math.PI);
        const dIn = (cr / R_IN) * (180 / Math.PI);

        const p = (r: number, deg: number) => polar(r, deg).map((n) => n.toFixed(2)).join(' ');
        return [
            `M ${p(R_OUT, a0 + dOut)}`,
            `A ${R_OUT} ${R_OUT} 0 0 1 ${p(R_OUT, a1 - dOut)}`,
            `Q ${p(R_OUT, a1)} ${p(R_OUT - cr, a1)}`,
            `L ${p(R_IN + cr, a1)}`,
            `Q ${p(R_IN, a1)} ${p(R_IN, a1 - dIn)}`,
            `A ${R_IN} ${R_IN} 0 0 0 ${p(R_IN, a0 + dIn)}`,
            `Q ${p(R_IN, a0)} ${p(R_IN + cr, a0)}`,
            `L ${p(R_OUT - cr, a0)}`,
            `Q ${p(R_OUT, a0)} ${p(R_OUT, a0 + dOut)}`,
            'Z',
        ].join(' ');
    }

    /** Percent offsets for the HTML label sitting over slot `i`. */
    function labelPos(i: number): { left: string; top: string } {
        const [x, y] = polar(R_LABEL, i * STEP);
        return { left: `${(x / VB) * 100}%`, top: `${(y / VB) * 100}%` };
    }

    const paths = Array.from({ length: SLOTS }, (_, i) => wedgePath(i));
    const labels = Array.from({ length: SLOTS }, (_, i) => labelPos(i));

    /** Which wedge a point is over, or null when it's in the hole or outside. */
    function slotAt(clientX: number, clientY: number): number | null {
        if (!dialEl) return null;
        const r = dialEl.getBoundingClientRect();
        const dx = clientX - (r.left + r.width / 2);
        const dy = clientY - (r.top + r.height / 2);
        const dist = Math.hypot(dx, dy) / (r.width / VB);
        if (dist < R_IN - 4 || dist > R_OUT + 10) return null;
        const deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
        return Math.round(((deg + 360) % 360) / STEP) % SLOTS;
    }

    /** The click path. A drag-release already fired the wedge and the browser sends a
     *  click behind it on the same gesture; that one must not fire it twice. */
    function clickSlot(i: number) {
        if (swallowClick) return;
        press(i);
    }

    function press(i: number) {
        const w = wedges[i] ?? null;
        if (!w) return onEmpty(i);
        if (w.confirm && armed !== i) {
            armed = i;
            sfx.arm();
            return;
        }
        armed = null;
        fired = true;
        sfx.fire(i);
        onFire(w);
    }

    // Open/close audio. `fired` suppresses the dismiss sound when a wedge already
    // played its own, and the initial mount (open=false) must stay silent.
    let wasOpen = false;
    let fired = false;
    $effect(() => {
        if (open) {
            wasOpen = true;
            fired = false;
            sfx.open();
            return;
        }
        hot = null;
        armed = null;
        if (wasOpen && !fired) sfx.close();
        wasOpen = false;
    });

    // Each wedge you cross ticks, pitched by slot, so sweeping the ring is playable.
    let lastTick: number | null = null;
    $effect(() => {
        if (!open) {
            lastTick = null;
            return;
        }
        if (hot === lastTick) return;
        lastTick = hot;
        if (hot !== null) sfx.tick(hot);
    });

    // Tracking lives on the window, not the dial: a press that starts on the orb keeps
    // implicit pointer capture on touch, so move events never reach the dial's own
    // handlers. Window listeners see the whole gesture either way.
    $effect(() => {
        if (!open) return;
        // untracked, so the parent clearing `dragging` mid-gesture can't re-run this
        // effect and wipe the latch
        dragLatch = untrack(() => dragging);
        function onMove(e: PointerEvent) {
            const next = slotAt(e.clientX, e.clientY);
            if (next !== hot) {
                hot = next;
                // moving to a different wedge restarts the hold
                if (holdTimer) clearTimeout(holdTimer);
                holdTimer = null;
                if (dragLatch && next !== null && wedges[next]) {
                    holdTimer = setTimeout(() => {
                        holdTimer = null;
                        heldOpen = true;
                        sfx.arm();
                        onEmpty(next);
                    }, HOLD_TO_EDIT_MS);
                }
            }
        }
        function onUp(e: PointerEvent) {
            if (holdTimer) clearTimeout(holdTimer);
            holdTimer = null;
            if (heldOpen) {
                // the hold already opened the picker; releasing must not also fire
                heldOpen = false;
                dragLatch = false;
                return;
            }
            if (!dragLatch) return;
            dragLatch = false;
            const slot = slotAt(e.clientX, e.clientY);
            if (slot === null) return;
            swallowClick = true;
            setTimeout(() => (swallowClick = false), 350);
            press(slot);
        }
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => {
            if (holdTimer) clearTimeout(holdTimer);
            holdTimer = null;
            heldOpen = false;
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
    });

    $effect(() => {
        if (!open) return;
        function onKey(e: KeyboardEvent) {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            onClose();
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });
</script>

{#if open}
    <!-- swallows the click that would otherwise land on whatever is behind the dial -->
    <div
        class="scrim"
        role="presentation"
        onclick={onClose}
        oncontextmenu={(e) => {
            e.preventDefault();
            onClose();
        }}
    ></div>

    <div bind:this={dialEl} class="dial" style="--dial:{size}px;" role="menu" tabindex="-1">
        <!-- The frosted material behind the ring. It has to be an HTML layer, not an
             SVG shape, because backdrop-filter doesn't apply to SVG paths. Masked to
             an annulus so the orb in the hole stays untouched. -->
        <div class="plate"></div>

        <!-- The hole is an explicit dismiss target. The dial sits above the scrim, so
             without this a click in the middle hits dead space instead of closing. -->
        <button class="hole" onclick={onClose} aria-label="Close the dial"></button>

        <svg viewBox="0 0 {VB} {VB}" aria-hidden="true">
            {#each paths as d, i}
                {@const w = wedges[i] ?? null}
                <path
                    class="wedge"
                    class:hot={hot === i}
                    class:on={w?.on}
                    class:armed={armed === i}
                    class:empty={!w}
                    {d}
                    style="animation-delay:{i * 26}ms"
                />
            {/each}
            <circle class="hairline" cx={C} cy={C} r={R_IN - 3} />
            <circle class="hairline out" cx={C} cy={C} r={R_OUT + 3} />
        </svg>

        <!-- the light under your finger: it doesn't trail the pointer, it snaps to
             whichever wedge you're over, so the ring feels detented -->
        <div
            class="puck"
            class:lit={hot !== null}
            style={hot !== null
                ? `left:${labels[hot].left}; top:${labels[hot].top};`
                : 'left:50%; top:50%;'}
        ></div>

        {#each labels as pos, i}
            {@const w = wedges[i] ?? null}
            {@const Icon = dialIcon(w?.icon ?? 'plus')}
            <button
                class="slot"
                class:hot={hot === i}
                class:on={w?.on}
                class:armed={armed === i}
                class:empty={!w}
                style="left:{pos.left}; top:{pos.top}; animation-delay:{i * 26}ms"
                onclick={() => clickSlot(i)}
                onpointerenter={() => (hot = i)}
                role="menuitem"
                title={w ? w.label : 'Bind this slot'}
            >
                <Icon size={16} strokeWidth={1.7} />
                <span class="cap">{armed === i ? 'CONFIRM' : (w?.label ?? '')}</span>
            </button>
        {/each}

        <div class="hub">
            {#if status}
                <!-- the orb is the identity; the hub only speaks when it has something
                     to report, so nothing sits over the orb's core at rest -->
                <span class="hub-label">{status}</span>
            {/if}
        </div>
    </div>
{/if}

<style>
    /* above every Field surface: panels (45), settings (45), the composer */
    .scrim {
        position: fixed;
        inset: 0;
        z-index: 90;
    }
    .dial {
        position: fixed;
        width: min(var(--dial), 92vmin);
        height: min(var(--dial), 92vmin);
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        z-index: 91;
        pointer-events: auto;
        animation: dial-in 0.26s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes dial-in {
        from { opacity: 0; transform: translate(-50%, -50%) scale(0.88); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }

    svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        overflow: visible;
    }
    .plate {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        background: var(--glass-tint);
        backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
        -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
        pointer-events: none;
        /* 26% and 48% of the full width are the ring's inner and outer radii */
        mask: radial-gradient(
            circle at 50% 50%,
            transparent 0 25.6%,
            #000 26.4% 47.6%,
            transparent 48.4%
        );
        -webkit-mask: radial-gradient(
            circle at 50% 50%,
            transparent 0 25.6%,
            #000 26.4% 47.6%,
            transparent 48.4%
        );
        filter: drop-shadow(0 20px 40px rgb(0 0 0 / 0.7));
    }
    .wedge {
        fill: rgb(var(--holo) / 0.08);
        stroke: rgb(var(--holo) / 0.26);
        stroke-width: 0.5;
        transition: fill 0.16s, stroke 0.16s;
        animation: wedge-in 0.34s cubic-bezier(0.16, 1, 0.3, 1) backwards;
    }
    /* each wedge swings in from behind the one before it; staggered clockwise, the
       ring reads as a single sweep from twelve o'clock rather than eight pops */
    @keyframes wedge-in {
        from {
            opacity: 0;
            transform: rotate(-16deg) scale(0.94);
            transform-origin: 100px 100px;
        }
        to {
            opacity: 1;
            transform: rotate(0deg) scale(1);
            transform-origin: 100px 100px;
        }
    }
    .wedge.empty {
        fill: rgb(var(--holo) / 0.015);
        stroke: rgb(var(--holo) / 0.1);
        stroke-dasharray: 2 3;
    }
    /* well below .hot: an active toggle must never read as the thing under your
       cursor, or two wedges look selected at once */
    .wedge.on {
        fill: rgb(var(--holo) / 0.16);
        stroke: rgb(var(--holo) / 0.4);
    }
    .wedge.hot {
        fill: rgb(var(--holo) / 0.42);
        stroke: rgb(var(--holo-soft) / 0.8);
    }
    .wedge.armed {
        fill: rgb(var(--holo2) / 0.45);
        stroke: rgb(var(--holo2));
    }
    .hairline {
        fill: none;
        stroke: rgb(var(--holo) / 0.3);
        stroke-width: 0.4;
    }
    .hairline.out {
        stroke: rgb(var(--holo) / 0.14);
        stroke-dasharray: 1 5;
    }

    /* 52% of the dial = twice the inner radius, so it exactly fills the hole */
    .hole {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: 52%;
        aspect-ratio: 1;
        border-radius: 50%;
        border: none;
        background: none;
        padding: 0;
        cursor: pointer;
        z-index: 1;
    }

    .puck {
        position: absolute;
        width: 34%;
        aspect-ratio: 1;
        transform: translate(-50%, -50%);
        border-radius: 50%;
        background: radial-gradient(
            circle,
            rgb(var(--holo-soft) / 0.5) 0%,
            rgb(var(--holo) / 0.28) 34%,
            transparent 68%
        );
        filter: blur(6px);
        opacity: 0;
        pointer-events: none;
        transition:
            left 0.17s cubic-bezier(0.16, 1, 0.3, 1),
            top 0.17s cubic-bezier(0.16, 1, 0.3, 1),
            opacity 0.16s ease;
    }
    .puck.lit {
        opacity: 1;
    }

    .slot {
        position: absolute;
        transform: translate(-50%, -50%);
        display: grid;
        justify-items: center;
        gap: 5px;
        width: 82px;
        padding: 0;
        background: none;
        border: none;
        cursor: pointer;
        color: var(--text-dim);
        transition: color 0.16s;
        animation: label-in 0.34s cubic-bezier(0.16, 1, 0.3, 1) backwards;
    }
    /* keeps the centering translate the wedge keyframes would otherwise drop */
    @keyframes label-in {
        from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }
    .slot.empty {
        color: var(--text-faint);
    }
    .slot.on {
        color: rgb(var(--holo-soft));
    }
    .slot.hot {
        color: var(--text);
    }
    .slot.armed {
        color: rgb(var(--holo2));
    }
    .cap {
        font-family: var(--font-mono);
        font-size: 8.5px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
    }

    .hub {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        display: grid;
        place-items: center;
        width: 42%;
        pointer-events: none;
    }
    .hub-label {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.32em;
        color: rgb(var(--holo-soft) / 0.9);
        text-transform: uppercase;
        text-align: center;
    }

    @media (prefers-reduced-motion: reduce) {
        .dial, .wedge, .slot { animation: none !important; }
    }
</style>
