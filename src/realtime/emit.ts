import { Dispatch } from '../models/dispatch';
import type { DispatchActivity, DispatchStatus } from '../models/dispatch';
import type { AgentActivity } from '../harness/activity';

/**
 * Per-dispatch realtime emitter. Streaming text + activities are buffered and
 * flushed (throttled) to the `dispatches` row; the browser watches that row via
 * Lux `.live()`. High-frequency token deltas thus become a few row updates, not
 * one write per token.
 */
const FLUSH_MS = 80;

function toDispatchActivity(a: AgentActivity): DispatchActivity {
    const r = a.details.result;
    return {
        id: a.id,
        tool: a.details.fn_name,
        displayName: a.details.display_name,
        args: a.details.args,
        status: a.status,
        result: r == null ? undefined : typeof r === 'string' ? r : JSON.stringify(r),
    };
}

export interface Emitter {
    delta(text: string): void;
    activity(a: AgentActivity): void;
    status(s: DispatchStatus): Promise<void>;
    setFullText(text: string): void;
    stop(): Promise<void>;
}

export function createEmitter(dispatchId: string, opts: { flushMs?: number } = {}): Emitter {
    let text = '';
    const activities = new Map<string, DispatchActivity>();
    let dirty = false;
    let stopped = false;

    async function flush(): Promise<void> {
        if (!dirty || stopped) return;
        dirty = false;
        await Dispatch.update(dispatchId, {
            streaming_text: text,
            activities: [...activities.values()],
        }).catch((e) => console.error('[emit] flush failed:', e));
    }

    const timer = setInterval(() => void flush(), opts.flushMs ?? FLUSH_MS);
    (timer as { unref?: () => void }).unref?.();

    return {
        delta(t) {
            text += t;
            dirty = true;
        },
        activity(a) {
            activities.set(a.id, toDispatchActivity(a));
            dirty = true;
        },
        async status(s) {
            await Dispatch.update(dispatchId, {
                status: s,
                streaming_text: text,
                activities: [...activities.values()],
            }).catch((e) => console.error('[emit] status failed:', e));
        },
        setFullText(t) {
            text = t;
            dirty = true;
        },
        async stop() {
            clearInterval(timer);
            await flush();
            stopped = true;
        },
    };
}
