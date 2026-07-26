<script lang="ts">
    // Instrument chrome around the Field: a bracketed border with a notched top,
    // ruler ticks down each edge, corner elbows, and a mono status strip along the
    // bottom. Pure decoration except the strip, which reports live state.
    let {
        status = [] as { key: string; value: string; on?: boolean }[],
        connected = true,
        label = '',
    }: {
        status?: { key: string; value: string; on?: boolean }[];
        connected?: boolean;
        label?: string;
    } = $props();

    // Ticks are evenly spaced with a longer mark every fifth, like a ruler.
    const TICKS = 34;
    const ticks = Array.from({ length: TICKS }, (_, i) => ({
        pos: (i / (TICKS - 1)) * 100,
        major: i % 5 === 0,
    }));
</script>

<div class="hud" aria-hidden="true">
    <!-- Rails are plain edges so they never stretch; only the centered notch is drawn,
         at a fixed width, so its bevels stay crisp at any viewport. -->
    <span class="rail top-left"></span>
    <span class="rail top-right"></span>
    <span class="rail bottom"></span>
    <span class="rail left"></span>
    <span class="rail right"></span>

    <svg class="notch" viewBox="0 0 320 14">
        <path d="M 0 13 L 96 13 L 116 1 L 204 1 L 224 13 L 320 13" />
    </svg>

    <span class="elbow tl"></span>
    <span class="elbow tr"></span>
    <span class="elbow bl"></span>
    <span class="elbow br"></span>

    <div class="ruler left">
        {#each ticks as t}
            <i class="tick" class:major={t.major} style="top:{t.pos}%"></i>
        {/each}
    </div>
    <div class="ruler right">
        {#each ticks as t}
            <i class="tick" class:major={t.major} style="top:{t.pos}%"></i>
        {/each}
    </div>
    <div class="ruler top">
        {#each ticks as t}
            <i class="tick" class:major={t.major} style="left:{t.pos}%"></i>
        {/each}
    </div>

    <!-- One status cluster, bottom right. The link state used to sit in the bottom
         left corner, where it collided with the theme dock, and it duplicated the dot
         in the top bar anyway. -->
    <div class="strip">
        <span class="link" class:off={!connected}>
            <i class="dot" class:off={!connected}></i>{connected ? 'link' : 'offline'}
        </span>
        {#each status as s}
            <span class="chip" class:on={s.on}>[{s.key}:{s.value}]</span>
        {/each}
        {#if label}<span class="chip muted">[{label}]</span>{/if}
    </div>
</div>

<style>
    .hud {
        position: fixed;
        inset: 0;
        z-index: 1;
        pointer-events: none;
        font-family: var(--font-mono);
    }

    .rail {
        position: absolute;
        background: rgb(var(--holo) / 0.34);
        box-shadow: 0 0 4px rgb(var(--holo) / 0.35);
    }
    .rail.top-left,
    .rail.top-right {
        top: 14px;
        height: 1px;
    }
    .rail.top-left { left: 46px; right: calc(50% + 160px); }
    .rail.top-right { right: 46px; left: calc(50% + 160px); }
    .rail.bottom { bottom: 14px; left: 46px; right: 46px; height: 1px; }
    .rail.left { left: 14px; top: 46px; bottom: 46px; width: 1px; }
    .rail.right { right: 14px; top: 46px; bottom: 46px; width: 1px; }

    .notch {
        position: absolute;
        top: 1px;
        left: 50%;
        transform: translateX(-50%);
        width: 320px;
        height: 14px;
        overflow: visible;
    }
    .notch path {
        fill: none;
        stroke: rgb(var(--holo) / 0.34);
        stroke-width: 1;
        filter: drop-shadow(0 0 3px rgb(var(--holo) / 0.35));
    }

    .elbow {
        position: absolute;
        width: 26px;
        height: 26px;
        border: 1.4px solid rgb(var(--holo) / 0.75);
        filter: drop-shadow(0 0 4px rgb(var(--holo) / 0.5));
    }
    .elbow.tl { top: 14px; left: 14px; border-right: 0; border-bottom: 0; border-top-left-radius: 3px; }
    .elbow.tr { top: 14px; right: 14px; border-left: 0; border-bottom: 0; border-top-right-radius: 3px; }
    .elbow.bl { bottom: 14px; left: 14px; border-right: 0; border-top: 0; border-bottom-left-radius: 3px; }
    .elbow.br { bottom: 14px; right: 14px; border-left: 0; border-top: 0; border-bottom-right-radius: 3px; }

    .ruler {
        position: absolute;
    }
    .ruler.left { left: 16px; top: 56px; bottom: 56px; width: 10px; }
    .ruler.right { right: 16px; top: 56px; bottom: 56px; width: 10px; }
    .ruler.top { top: 16px; left: 74px; right: 74px; height: 10px; }

    .tick {
        position: absolute;
        background: rgb(var(--holo) / 0.4);
    }
    .ruler.left .tick, .ruler.right .tick {
        height: 1px;
        width: 4px;
    }
    .ruler.left .tick { left: 0; }
    .ruler.right .tick { right: 0; }
    .ruler.left .tick.major, .ruler.right .tick.major {
        width: 9px;
        background: rgb(var(--holo) / 0.62);
    }
    .ruler.top .tick {
        width: 1px;
        height: 4px;
        top: 0;
    }
    .ruler.top .tick.major {
        height: 9px;
        background: rgb(var(--holo) / 0.62);
    }

    .link {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        color: rgb(var(--holo) / 0.75);
    }
    .link.off {
        color: var(--text-faint);
    }
    .dot {
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: rgb(var(--holo));
        box-shadow: 0 0 6px rgb(var(--holo));
        animation: blink 3.4s ease-in-out infinite;
    }
    .dot.off {
        background: var(--text-faint);
        box-shadow: none;
        animation: none;
    }
    @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.35; }
    }

    /* clear of the bottom rail (14) and the corner elbow (14..40) */
    .strip {
        position: absolute;
        right: 48px;
        bottom: 26px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 8.5px;
        letter-spacing: 0.1em;
        color: rgb(var(--holo) / 0.55);
        max-width: 62vw;
        overflow: hidden;
    }
    .chip {
        white-space: nowrap;
    }
    .chip.on {
        color: rgb(var(--holo-soft));
        text-shadow: 0 0 8px rgb(var(--holo) / 0.6);
    }
    /* --text-faint disappears at this size against light-mode glass */
    .chip.muted {
        color: var(--text-dim);
    }

    @media (prefers-reduced-motion: reduce) {
        .dot { animation: none; }
    }
    @media (max-width: 720px) {
        .ruler.top, .strip { display: none; }
    }
</style>
