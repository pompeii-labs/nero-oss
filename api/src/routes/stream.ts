import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { Message } from '../models/message';
import { getLux, unwrap } from '@nero/shared/lux';

interface DispatchRow {
    id: string;
    status: string | null;
    streaming_text: string | null;
    activities: unknown;
    updated_at: number | null;
}

/** Tables the native Field mirrors. The web subscribes to each via Lux `.live()`;
 *  here we poll server-side and emit per-row deltas so a native client never needs
 *  a Lux client. `event` is the SSE event name the app switches on. */
const WATCHED: { table: string; event: string; order: string; limit: number }[] = [
    { table: 'panels', event: 'panel', order: 'updated_at', limit: 50 },
    { table: 'questions', event: 'question', order: 'created_at', limit: 20 },
    { table: 'projects', event: 'project', order: 'updated_at', limit: 20 },
    { table: 'project_tasks', event: 'task', order: 'updated_at', limit: 100 },
];

/**
 * Native-client realtime bridge. Emits `message` (chat history, then new rows),
 * `dispatch` (the live in-flight turn), and per-row `panel`/`question`/`project`/`task`
 * events. A row is (re)emitted whenever its JSON snapshot changes; the app upserts by
 * id and reads `status` to drop closed/finished rows. Single-user model, so polling
 * Lux at 250ms is fine.
 */
export function streamRoutes(): Hono {
    const app = new Hono();

    app.get('/v1/stream', (c) =>
        streamSSE(c, async (stream) => {
            let open = true;
            stream.onAbort(() => {
                open = false;
            });

            const history = await Message.getSessionHistory({ limit: 200 });
            let lastId = 0;
            for (const m of history) {
                await stream.writeSSE({ event: 'message', data: JSON.stringify(m) });
                lastId = Math.max(lastId, m.id);
            }
            await stream.writeSSE({ event: 'ready', data: '{}' });

            let lastDispatch = '';
            const caches: Record<string, Map<string, string>> = {};
            for (const w of WATCHED) caches[w.table] = new Map();

            while (open) {
                try {
                    const fresh = await Message.getSessionHistory({ since: lastId });
                    for (const m of fresh) {
                        await stream.writeSSE({ event: 'message', data: JSON.stringify(m) });
                        lastId = Math.max(lastId, m.id);
                    }

                    const drows = unwrap(
                        await getLux()
                            .table('dispatches')
                            .select()
                            .order('updated_at', { ascending: false })
                            .limit(1),
                    ) as DispatchRow[];
                    if (drows.length) {
                        const snap = JSON.stringify(drows[0]);
                        if (snap !== lastDispatch) {
                            lastDispatch = snap;
                            await stream.writeSSE({ event: 'dispatch', data: snap });
                        }
                    }

                    for (const w of WATCHED) {
                        try {
                            const rows = unwrap(
                                await getLux()
                                    .table(w.table)
                                    .select()
                                    .order(w.order, { ascending: false })
                                    .limit(w.limit),
                            ) as { id: string }[];
                            const cache = caches[w.table];
                            for (const row of rows) {
                                const snap = JSON.stringify(row);
                                if (cache.get(row.id) !== snap) {
                                    cache.set(row.id, snap);
                                    await stream.writeSSE({ event: w.event, data: snap });
                                }
                            }
                        } catch {
                            // one bad table shouldn't kill the whole stream
                        }
                    }

                    await stream.sleep(250);
                } catch {
                    break; // connection closed mid-write
                }
            }
        }),
    );

    return app;
}
