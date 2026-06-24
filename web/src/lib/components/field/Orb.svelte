<script lang="ts">
    // Nero's presence. An obsidian sphere lit from within, wrapped in a
    // gyroscopic reticle. Reads theme tokens, so its heart is cyan in Obsidian
    // and molten in Forge.
    //
    // `state` drives how hard it burns. While `thinking` it becomes the loader:
    // the heart hammers, the reticle spins up, energy pings outward, and a
    // synapse network fires inside it.
    let {
        size = 230,
        state = 'idle',
    }: { size?: number; state?: 'idle' | 'thinking' | 'speaking' | 'tool' } = $props();

    const uid = 'orb-' + id();

    // A small neural net inside the sphere (viewBox 200, center 100,100).
    const nodes: [number, number][] = [
        [100, 54], [141, 78], [150, 122], [116, 151],
        [76, 147], [52, 108], [68, 72], [100, 104],
    ];
    const edges: [number, number][] = [
        [7, 0], [7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6],
        [0, 1], [1, 2], [3, 4], [5, 6],
    ];
</script>

<script lang="ts" module>
    let n = 0;
    function id() {
        return (n++).toString(36);
    }
</script>

<div class="orb" data-state={state} style="width:{size}px; height:{size}px;">
    <div class="bloom"></div>
    <div class="sphere"></div>
    <div class="core"></div>

    <!-- tool-state layers -->
    <div class="flare"></div>
    <div class="brackets">
        <span class="bk tl"></span><span class="bk tr"></span>
        <span class="bk bl"></span><span class="bk br"></span>
    </div>

    <div class="ping p1"></div>
    <div class="ping p2"></div>

    <svg class="synapse" viewBox="0 0 200 200" aria-hidden="true">
        {#each edges as e, i}
            <line
                class="edge"
                x1={nodes[e[0]][0]}
                y1={nodes[e[0]][1]}
                x2={nodes[e[1]][0]}
                y2={nodes[e[1]][1]}
                style="animation-delay:{(i * -0.37).toFixed(2)}s"
            />
        {/each}
        {#each nodes as nd, i}
            <circle
                class="node"
                class:hub={i === 7}
                cx={nd[0]}
                cy={nd[1]}
                r={i === 7 ? 2.6 : 1.7}
                style="animation-delay:{(i * -0.29).toFixed(2)}s"
            />
        {/each}
    </svg>

    <svg class="reticle" viewBox="0 0 200 200" aria-hidden="true">
        <defs>
            <filter id={uid} x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="1.4" />
            </filter>
        </defs>
        <g filter="url(#{uid})">
            <circle class="r1" cx="100" cy="100" r="92" />
            <circle class="r2" cx="100" cy="100" r="78" />
            <circle class="r3" cx="100" cy="100" r="64" />
        </g>
        <circle class="rim" cx="100" cy="100" r="90" />
        <circle class="orbit-dot" cx="100" cy="10" r="2.5" />
    </svg>
</div>

<style>
    .orb {
        position: relative;
        animation: breathe 7s ease-in-out infinite;
    }
    @keyframes breathe {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.025); }
    }

    .bloom {
        position: absolute;
        inset: -26%;
        background: radial-gradient(
            circle,
            rgb(var(--holo) / 0.28),
            rgb(var(--holo) / 0.06) 42%,
            transparent 66%
        );
        filter: blur(8px);
        transition: opacity 0.4s;
    }
    .sphere {
        position: absolute;
        inset: 10%;
        border-radius: 50%;
        background: var(--orb-body);
        box-shadow:
            inset 0 0 40px rgb(0 0 0 / 0.8),
            inset 8px 10px 30px rgb(var(--holo-soft) / 0.1),
            inset -10px -14px 40px rgb(0 0 0 / 0.7),
            0 24px 60px -20px rgb(0 0 0 / 0.9);
    }
    .core {
        position: absolute;
        inset: 10%;
        border-radius: 50%;
        background: radial-gradient(
            circle at 50% 53%,
            rgb(var(--holo-hot)) 0%,
            rgb(var(--holo)) 15%,
            rgb(var(--holo) / 0.35) 33%,
            transparent 57%
        );
        mix-blend-mode: var(--orb-blend, screen);
        filter: blur(2px);
        animation: pulse 7s ease-in-out infinite;
    }
    @keyframes pulse {
        0%, 100% { opacity: 0.78; transform: scale(0.96); }
        50% { opacity: 1; transform: scale(1.05); }
    }

    /* reticle */
    .reticle {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        overflow: visible;
    }
    .reticle circle { fill: none; transform-origin: 100px 100px; }
    .r1 { stroke: rgb(var(--holo)); stroke-width: 0.6; stroke-opacity: 0.5; stroke-dasharray: 2 4; animation: spin 26s linear infinite; }
    .r2 { stroke: rgb(var(--holo2)); stroke-width: 0.7; stroke-opacity: 0.4; stroke-dasharray: 40 14; animation: spin 18s linear infinite reverse; }
    .r3 { stroke: rgb(var(--holo)); stroke-width: 0.5; stroke-opacity: 0.6; stroke-dasharray: 1 6; animation: spin 34s linear infinite; }
    .rim {
        stroke: rgb(var(--holo-soft));
        stroke-width: 1.1;
        stroke-opacity: 0.85;
        stroke-dasharray: 64 286;
        stroke-linecap: round;
        filter: drop-shadow(0 0 5px rgb(var(--holo-soft) / 0.8));
        animation: spin 12s linear infinite;
    }
    .orbit-dot {
        fill: rgb(var(--holo-hot));
        filter: drop-shadow(0 0 6px rgb(var(--holo)));
        animation: spin 12s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* synapse net — idle: dim + still. thinking: fires. */
    .synapse {
        position: absolute;
        inset: 10%;
        width: 80%;
        height: 80%;
        overflow: visible;
        opacity: 0;
        transition: opacity 0.45s;
    }
    .edge {
        stroke: rgb(var(--holo-soft));
        stroke-width: 0.5;
        stroke-opacity: 0.08;
    }
    .node {
        fill: rgb(var(--holo-soft));
        opacity: 0.3;
    }
    .node.hub { fill: rgb(var(--holo-hot)); }

    /* energy pings — only while thinking */
    .ping {
        position: absolute;
        inset: 12%;
        border-radius: 50%;
        border: 1px solid rgb(var(--holo) / 0.5);
        opacity: 0;
        pointer-events: none;
    }

    /* ---- THINKING: come alive ---- */
    .orb[data-state='thinking'] {
        animation-duration: 3.4s;
    }
    .orb[data-state='thinking'] .core {
        animation: pulse-hot 1.5s ease-in-out infinite;
    }
    @keyframes pulse-hot {
        0%, 100% { opacity: 0.85; transform: scale(0.92); filter: blur(2px) brightness(1); }
        45% { opacity: 1; transform: scale(1.12); filter: blur(1.5px) brightness(1.45); }
    }
    .orb[data-state='thinking'] .bloom { opacity: 1.25; }
    .orb[data-state='thinking'] .rim,
    .orb[data-state='thinking'] .orbit-dot { animation-duration: 4.5s; }
    .orb[data-state='thinking'] .r1 { animation-duration: 13s; }
    .orb[data-state='thinking'] .r3 { animation-duration: 17s; }

    .orb[data-state='thinking'] .synapse { opacity: 1; }
    .orb[data-state='thinking'] .edge {
        animation: edge-fire 1.5s ease-in-out infinite;
    }
    @keyframes edge-fire {
        0%, 100% { stroke-opacity: 0.05; }
        50% { stroke-opacity: 0.65; }
    }
    .orb[data-state='thinking'] .node {
        animation: node-fire 1.3s ease-in-out infinite;
    }
    @keyframes node-fire {
        0%, 100% { opacity: 0.25; filter: none; }
        50% { opacity: 1; filter: drop-shadow(0 0 4px rgb(var(--holo))); }
    }
    .orb[data-state='thinking'] .ping { animation: ping 2.6s ease-out infinite; }
    .orb[data-state='thinking'] .p2 { animation-delay: 1.3s; }
    @keyframes ping {
        0% { transform: scale(0.5); opacity: 0.55; }
        70% { opacity: 0; }
        100% { transform: scale(1.55); opacity: 0; }
    }

    /* speaking: a gentler, steady glow */
    .orb[data-state='speaking'] .core { animation-duration: 3.6s; }

    /* ---- TOOL: reaching out, acting on the world ---- */
    /* counter-accent flare, radar sweep, lock-on brackets. Distinct from the
       introspective neural firing of `thinking`. */
    .flare {
        position: absolute;
        inset: 10%;
        border-radius: 50%;
        background: radial-gradient(
            circle at 50% 53%,
            rgb(var(--holo2) / 0.6) 0%,
            rgb(var(--holo2) / 0.22) 24%,
            transparent 48%
        );
        mix-blend-mode: var(--orb-blend, screen);
        filter: blur(3px);
        opacity: 0;
        transition: opacity 0.3s;
    }
    .brackets {
        position: absolute;
        inset: -3%;
        opacity: 0;
        pointer-events: none;
    }
    .bk {
        position: absolute;
        width: 13px;
        height: 13px;
        border: 1.5px solid rgb(var(--holo2));
        filter: drop-shadow(0 0 4px rgb(var(--holo2) / 0.7));
    }
    .bk.tl { top: 0; left: 0; border-right: 0; border-bottom: 0; }
    .bk.tr { top: 0; right: 0; border-left: 0; border-bottom: 0; }
    .bk.bl { bottom: 0; left: 0; border-right: 0; border-top: 0; }
    .bk.br { bottom: 0; right: 0; border-left: 0; border-top: 0; }

    .orb[data-state='tool'] { animation-duration: 5s; }
    .orb[data-state='tool'] .flare {
        opacity: 1;
        animation: channel 0.7s ease-in-out infinite;
    }
    @keyframes channel {
        0%, 100% { opacity: 0.45; transform: scale(0.9); }
        50% { opacity: 0.9; transform: scale(1.08); }
    }
    .orb[data-state='tool'] .brackets {
        opacity: 1;
        animation: lock 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes lock {
        from { opacity: 0; transform: scale(1.18); }
        to { opacity: 1; transform: scale(1); }
    }
    .orb[data-state='tool'] .core { animation: pulse-hot 0.8s ease-in-out infinite; }
    .orb[data-state='tool'] .bloom { opacity: 1.15; }
    .orb[data-state='tool'] .synapse { opacity: 0; } /* neural recedes; he's acting */
    .orb[data-state='tool'] .rim,
    .orb[data-state='tool'] .orbit-dot { animation-duration: 2.4s; }
    .orb[data-state='tool'] .r1 { animation-duration: 8s; }
    .orb[data-state='tool'] .r2 { animation-duration: 6s; }
    .orb[data-state='tool'] .ping { animation: ping 1.5s ease-out infinite; }

    @media (prefers-reduced-motion: reduce) {
        .orb, .core, .r1, .r2, .r3, .rim, .orbit-dot,
        .edge, .node, .ping, .flare, .brackets { animation: none !important; }
        .orb[data-state='thinking'] .synapse { opacity: 0.6; }
        .orb[data-state='tool'] .flare,
        .orb[data-state='tool'] .brackets { opacity: 1; }
    }
</style>
