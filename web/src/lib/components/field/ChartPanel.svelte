<script lang="ts">
    import { untrack } from 'svelte';
    import { toNum, pushSample, chartGeometry } from '$lib/panels/chart';
    // A lightweight SVG chart for live dashboards. Feed it either a full series
    // (`data`: number[]) or a single live scalar (`value`) which it accumulates
    // into a rolling buffer — so a polled metric becomes a sparkline for free.
    let {
        data,
        value,
        window = 40,
        sampleMs = 2000,
        kind = 'line',
        height = 48,
        min,
        max,
    }: {
        data?: unknown;
        value?: unknown;
        window?: number;
        sampleMs?: number;
        kind?: 'line' | 'area' | 'bar';
        height?: number;
        min?: number;
        max?: number;
    } = $props();

    // An explicit array (from `data`, or a `value` binding that resolves to one) is
    // plotted directly. Otherwise `value` is a live scalar we sample on a clock.
    const arraySource = $derived(
        Array.isArray(data) ? data : Array.isArray(value) ? (value as unknown[]) : null,
    );

    let buf = $state<number[]>([]);
    $effect(() => {
        if (arraySource) return;
        const ms = Math.max(250, sampleMs);
        // Read value/window inside the tick (untracked) so the interval is created
        // ONCE and isn't torn down + rebuilt on every update.
        const tick = () => {
            const v = toNum(value);
            if (v !== undefined) buf = pushSample(buf, v, window);
        };
        untrack(tick);
        const id = setInterval(tick, ms);
        return () => clearInterval(id);
    });

    const series = $derived<number[]>(
        arraySource
            ? arraySource.map(toNum).filter((n): n is number => n !== undefined)
            : buf,
    );

    const W = 100;
    const H = 100;
    const geom = $derived(chartGeometry(series, min, max));
</script>

<div class="chart" style="height:{height}px">
    {#if series.length < 2}
        <span class="empty">collecting…</span>
    {:else}
        <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true">
            {#if kind === 'area'}
                <polygon class="area" points={geom.area} />
                <polyline class="line" points={geom.line} />
            {:else if kind === 'bar'}
                {#each geom.bars as b}
                    <rect class="bar" x={b.x} y={b.y} width={b.w} height={Math.max(0.5, b.h)} />
                {/each}
            {:else}
                <polyline class="line" points={geom.line} />
            {/if}
        </svg>
    {/if}
</div>

<style>
    .chart {
        width: 100%;
        position: relative;
    }
    .chart svg {
        width: 100%;
        height: 100%;
        display: block;
        overflow: visible;
    }
    .line {
        fill: none;
        stroke: rgb(var(--holo));
        stroke-width: 1.6;
        stroke-linejoin: round;
        stroke-linecap: round;
        vector-effect: non-scaling-stroke;
        filter: drop-shadow(0 0 3px rgb(var(--holo) / 0.5));
    }
    .area {
        fill: rgb(var(--holo) / 0.14);
        stroke: none;
    }
    .bar {
        fill: rgb(var(--holo) / 0.55);
    }
    .empty {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.1em;
        color: var(--text-faint);
        text-transform: uppercase;
    }
</style>
