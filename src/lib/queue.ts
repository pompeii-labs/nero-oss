import { Queue, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { cpus } from 'os';
import { loadConfig } from '../config';

export const PROJECT_QUEUE = 'nero-projects';

/** Concurrency cap for the worker fleet: the number of task agents running at once. */
export function projectConcurrency(): number {
    return Math.max(2, Math.min(8, cpus().length));
}

/** A fresh ioredis connection to Lux's RESP port for BullMQ. Lux speaks Redis; its
 *  `lux://` URL is `redis://` with a different scheme (the SDK does the same rewrite).
 *  Use the URL-STRING form: BullMQ works with it, but the bare host/port options form
 *  doesn't reach Lux's IPv6 RESP listener. The cast bridges BullMQ's bundled copy of
 *  ioredis vs ours (runtime-compatible, both ioredis 5.x). */
export function luxRedis(): ConnectionOptions {
    const direct = loadConfig().lux.directUrl;
    if (!direct) throw new Error('LUX_DIRECT_URL not set, needed for the project queue');
    const url = direct.replace(/^luxs:\/\//, 'rediss://').replace(/^lux:\/\//, 'redis://');
    return new IORedis(url, { maxRetriesPerRequest: null }) as unknown as ConnectionOptions;
}

let queue: Queue | null = null;

export function getQueue(): Queue {
    if (!queue) queue = new Queue(PROJECT_QUEUE, { connection: luxRedis() });
    return queue;
}

/** Shut down queue connections (tests / graceful exit). */
export async function closeQueues(): Promise<void> {
    await queue?.close().catch(() => {});
    queue = null;
}
