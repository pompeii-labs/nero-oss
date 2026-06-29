/** Pure helpers behind ChartPanel — extracted so they can be unit-tested without
 *  mounting a component. */

const W = 100;
const H = 100;
const PAD = 6;

/** Coerce to a number, tolerating formatted strings like "$60,894" or "42%". */
export function toNum(x: unknown): number | undefined {
    if (typeof x === 'number') return Number.isFinite(x) ? x : undefined;
    if (typeof x === 'string') {
        const n = parseFloat(x.replace(/[^0-9.-]/g, ''));
        return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
}

/** Append a sample, keeping at most `window` of the most recent points. */
export function pushSample(buf: number[], v: number, window: number): number[] {
    return [...buf, v].slice(-Math.max(1, window));
}

export interface ChartGeometry {
    line: string;
    area: string;
    bars: { x: number; w: number; y: number; h: number }[];
}

/** Build SVG geometry for a series, scaled to the 0..100 viewBox. Returns empty
 *  shapes for fewer than 2 points (the component shows a "collecting" state). */
export function chartGeometry(series: number[], min?: number, max?: number): ChartGeometry {
    if (series.length < 2) return { line: '', area: '', bars: [] };
    const lo = min ?? Math.min(...series);
    const hi = max ?? Math.max(...series);
    const span = hi - lo || 1;
    const x = (i: number) => (i / (series.length - 1)) * W;
    const y = (v: number) => H - PAD - ((v - lo) / span) * (H - PAD * 2);
    const pts = series.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`);
    const line = pts.join(' ');
    const area = `0,${H} ${line} ${W},${H}`;
    const bw = (W / series.length) * 0.7;
    const bars = series.map((v, i) => ({
        x: (i / series.length) * W + (W / series.length - bw) / 2,
        w: bw,
        y: y(v),
        h: H - PAD - y(v),
    }));
    return { line, area, bars };
}
