<script lang="ts">
    // The space Nero lives in: a deep ground, two slow-drifting light clouds for
    // ambient depth, a faint mote field, and an optional perspective floor.
    // Quiet and cool by default; theme-driven.
    let {
        floor = false,
        motes = 6,
    }: { floor?: boolean; motes?: number } = $props();

    const particles = Array.from({ length: motes }, (_, i) => {
        const r = ((i * 9301 + 49297) % 233280) / 233280;
        const r2 = ((i * 4096 + 150889) % 714025) / 714025;
        const r3 = ((i * 277 + 13) % 997) / 997;
        return {
            left: 4 + r * 92,
            top: 6 + r2 * 86,
            size: 1 + r3 * 1.8,
            alt: r3 > 0.9,
            delay: -(r * 22),
            dur: 22 + r2 * 22,
            op: 0.1 + r3 * 0.28,
        };
    });
</script>

<div class="atmos" aria-hidden="true">
    <div class="cloud c1"></div>
    <div class="cloud c2"></div>
    <div class="vignette"></div>
    {#if floor}<div class="floor"></div>{/if}
    <div class="motes">
        {#each particles as p}
            <span
                class="mote"
                class:alt={p.alt}
                style="left:{p.left}%; top:{p.top}%; width:{p.size}px; height:{p.size}px; opacity:{p.op}; animation-delay:{p.delay}s; animation-duration:{p.dur}s;"
            ></span>
        {/each}
    </div>
</div>

<style>
    .atmos {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 0;
        background: var(--field-bg);
        overflow: hidden;
    }

    /* slow ambient light, drifting — gives depth without reading as particles */
    .cloud {
        position: absolute;
        border-radius: 50%;
        filter: blur(60px);
        opacity: 0.55;
        will-change: transform;
    }
    .c1 {
        width: 60vw;
        height: 60vw;
        left: -10vw;
        top: -18vw;
        background: radial-gradient(circle, rgb(var(--holo) / 0.07), transparent 62%);
        animation: drift1 46s ease-in-out infinite;
    }
    .c2 {
        width: 50vw;
        height: 50vw;
        right: -8vw;
        bottom: -16vw;
        background: radial-gradient(circle, var(--ambient2), transparent 62%);
        animation: drift2 58s ease-in-out infinite;
    }
    @keyframes drift1 {
        0%, 100% { transform: translate(0, 0); }
        50% { transform: translate(6vw, 4vw); }
    }
    @keyframes drift2 {
        0%, 100% { transform: translate(0, 0); }
        50% { transform: translate(-5vw, -3vw); }
    }

    .vignette {
        position: absolute;
        inset: 0;
        background: radial-gradient(120% 85% at 50% 42%, transparent 50%, rgb(0 0 0 / 0.6) 100%);
    }
    .floor {
        position: absolute;
        left: -20%;
        right: -20%;
        bottom: -4%;
        height: 44%;
        background-image:
            linear-gradient(rgb(var(--holo) / 0.12) 1px, transparent 1px),
            linear-gradient(90deg, rgb(var(--holo) / 0.12) 1px, transparent 1px);
        background-size: 56px 56px;
        transform: perspective(620px) rotateX(74deg);
        transform-origin: bottom center;
        mask-image: linear-gradient(to top, #000 0%, transparent 78%);
        -webkit-mask-image: linear-gradient(to top, #000 0%, transparent 78%);
        opacity: 0.42;
    }

    .motes {
        position: absolute;
        inset: 0;
    }
    .mote {
        position: absolute;
        border-radius: 50%;
        background: rgb(var(--holo-soft));
        box-shadow: 0 0 5px 1px rgb(var(--holo-soft) / 0.4);
        animation: drift linear infinite;
    }
    .mote.alt {
        background: rgb(var(--holo2));
        box-shadow: 0 0 5px 1px rgb(var(--holo2) / 0.4);
    }
    @keyframes drift {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-22px); }
    }
    @media (prefers-reduced-motion: reduce) {
        .mote, .cloud { animation: none !important; }
    }
</style>
