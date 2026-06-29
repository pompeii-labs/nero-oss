import { cpus } from 'os';

/** Concurrency cap for the worker fleet — the number of task agents running at once. */
export function projectConcurrency(): number {
    return Math.max(2, Math.min(8, cpus().length));
}

type Runner = () => Promise<void>;

/** A tiny in-process work pool with a fixed concurrency cap. Dedupes by key so the
 *  same task can't run twice concurrently. Project tasks run here as headless agents;
 *  durable state lives in Lux tables, so a restart resumes via the boot reconciler. */
class Pool {
    private limit = projectConcurrency();
    private running = new Set<string>();
    private queued = new Map<string, Runner>();
    private order: string[] = [];

    /** Schedule `run` under `key`; ignored if that key is already running or queued. */
    submit(key: string, run: Runner): void {
        if (this.running.has(key) || this.queued.has(key)) return;
        this.queued.set(key, run);
        this.order.push(key);
        this.pump();
    }

    private pump(): void {
        while (this.running.size < this.limit && this.order.length > 0) {
            const key = this.order.shift();
            if (!key) continue;
            const run = this.queued.get(key);
            if (!run) continue;
            this.queued.delete(key);
            this.running.add(key);
            void run()
                .catch(() => {})
                .finally(() => {
                    this.running.delete(key);
                    this.pump();
                });
        }
    }
}

export const pool = new Pool();
