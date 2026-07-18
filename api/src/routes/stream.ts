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

/**
 * Native-client realtime bridge. The web subscribes to Lux tables directly with
 * `.live()`; native apps get the same stream here as SSE, so they never need a Lux
 * client. Emits `message` events (chat history, then new rows) and `dispatch`
 * events (the live in-flight turn: streaming_text, activities, status). Polls Lux
 * server-side, which is fine for Nero's single-user model.
 */
export function streamRoutes(): Hono {
    const app = new Hono();

    app.get('/v1/stream', (c) =>
        streamSSE(c, async (stream) => {
            let open = true;
            stream.onAbort(() => {
                open = false;
            });

            // Backfill recent history, then follow.
            const history = await Message.getSessionHistory({ limit: 200 });
            let lastId = 0;
            for (const m of history) {
                await stream.writeSSE({ event: 'message', data: JSON.stringify(m) });
                lastId = Math.max(lastId, m.id);
            }
            await stream.writeSSE({ event: 'ready', data: '{}' });

            let lastDispatch = '';
            while (open) {
                try {
                    const fresh = await Message.getSessionHistory({ since: lastId });
                    for (const m of fresh) {
                        await stream.writeSSE({ event: 'message', data: JSON.stringify(m) });
                        lastId = Math.max(lastId, m.id);
                    }

                    const rows = unwrap(
                        await getLux()
                            .table('dispatches')
                            .select()
                            .order('updated_at', { ascending: false })
                            .limit(1),
                    ) as DispatchRow[];
                    if (rows.length) {
                        const snap = JSON.stringify(rows[0]);
                        if (snap !== lastDispatch) {
                            lastDispatch = snap;
                            await stream.writeSSE({ event: 'dispatch', data: snap });
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
