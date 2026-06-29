/** In-memory registry of questions Nero is currently blocked on. The `ask` tool
 *  registers a waiter; the answer route (same process) resolves it. Lives only in
 *  the running service — a restart drops waiters (and the dispatches awaiting them
 *  are cancelled by orphan cleanup), so questions don't survive a restart. */

export type AskResult =
    | { kind: 'answered'; answers: string[][] }
    | { kind: 'timeout' }
    | { kind: 'cancelled' };

interface Waiter {
    resolve: (r: AskResult) => void;
    timer: ReturnType<typeof setTimeout>;
}

const waiters = new Map<string, Waiter>();

/** Block until the question `id` is answered, dismissed, or times out. */
export function waitForAnswer(id: string, timeoutMs: number): Promise<AskResult> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            waiters.delete(id);
            resolve({ kind: 'timeout' });
        }, timeoutMs);
        waiters.set(id, { resolve, timer });
    });
}

/** Resolve a waiting question. Returns false if nothing was waiting (stale click). */
export function deliverAnswer(id: string, result: AskResult): boolean {
    const w = waiters.get(id);
    if (!w) return false;
    clearTimeout(w.timer);
    waiters.delete(id);
    w.resolve(result);
    return true;
}
