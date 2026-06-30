/** In-memory registry of projects whose plan is awaiting the user's go-ahead. The
 *  `plan_project` tool registers a waiter; the approve route (same process) resolves
 *  it. Lives only in the running service — a restart drops waiters, and the boot
 *  reconciler cancels any project still `awaiting_approval`. */

export type ApprovalResult =
    | { kind: 'run'; budgetUsd: number }
    | { kind: 'tweak'; note: string }
    | { kind: 'cancel' }
    | { kind: 'timeout' };

interface Waiter {
    resolve: (r: ApprovalResult) => void;
    timer: ReturnType<typeof setTimeout>;
}

const waiters = new Map<string, Waiter>();

/** Block until the project plan `id` is approved, tweaked, cancelled, or times out. */
export function waitForApproval(id: string, timeoutMs: number): Promise<ApprovalResult> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            waiters.delete(id);
            resolve({ kind: 'timeout' });
        }, timeoutMs);
        waiters.set(id, { resolve, timer });
    });
}

/** Resolve a waiting approval. Returns false if nothing was waiting (stale click). */
export function deliverApproval(id: string, result: ApprovalResult): boolean {
    const w = waiters.get(id);
    if (!w) return false;
    clearTimeout(w.timer);
    waiters.delete(id);
    w.resolve(result);
    return true;
}
