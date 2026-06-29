/** Pure polling-schedule logic behind PanelLayer's auto-refresh. Extracted so the
 *  reconcile (which decides what to start/stop) can be unit-tested without timers. */

export interface PollSpec {
    pid: string;
    fn: string;
    everyMs: number;
}

interface PanelLike {
    id: string;
    functions?: Record<string, { everyMs?: number }> | null;
}

/** The set of (panel, function) pairs that should be polling, keyed `pid:fn`.
 *  Only functions with everyMs at or above `minMs` qualify. */
export function desiredPolls(panels: PanelLike[], minMs = 1000): Map<string, PollSpec> {
    const want = new Map<string, PollSpec>();
    for (const p of panels) {
        for (const [fn, cfg] of Object.entries(p.functions ?? {})) {
            const ms = cfg?.everyMs;
            if (typeof ms === 'number' && ms >= minMs)
                want.set(`${p.id}:${fn}`, { pid: p.id, fn, everyMs: ms });
        }
    }
    return want;
}

/** Diff desired polls against the running set (key -> everyMs). A poll whose
 *  interval changed is both stopped and started so it restarts on the new cadence;
 *  unchanged polls are left running untouched. */
export function reconcilePolls(
    desired: Map<string, PollSpec>,
    running: Map<string, number>,
): { stop: string[]; start: PollSpec[] } {
    const stop: string[] = [];
    for (const [key, ms] of running) {
        const d = desired.get(key);
        if (!d || d.everyMs !== ms) stop.push(key);
    }
    const start: PollSpec[] = [];
    for (const [, d] of desired) {
        const ms = running.get(`${d.pid}:${d.fn}`);
        if (ms === undefined || ms !== d.everyMs) start.push(d);
    }
    return { stop, start };
}
