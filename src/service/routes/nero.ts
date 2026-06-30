import { Hono } from 'hono';
import { saveUpload } from '../../files/store';
import type { AttachmentRef } from '../../models/message';
import type { Dispatcher } from '../../harness/dispatch';

export interface NeroDeps {
    startDispatch: typeof Dispatcher.start;
    cancelActive: typeof Dispatcher.cancelActive;
}

/** Fire-and-forget dispatch + cancel. The streamed result lands on Lux (the
 *  browser watches it via .live()), not the HTTP response. */
export function neroRoutes(deps: NeroDeps): Hono {
    const app = new Hono();

    app.post('/v1/nero', async (c) => {
        const body = (await c.req.json().catch(() => ({}))) as {
            text?: unknown;
            attachments?: Array<{ data?: string; name?: string; mimeType?: string }>;
        };
        if (typeof body.text !== 'string' || !body.text.trim()) {
            return c.json({ error: 'text required' }, 400);
        }

        let attachments: AttachmentRef[] | undefined;
        if (Array.isArray(body.attachments) && body.attachments.length > 0) {
            attachments = [];
            for (const a of body.attachments) {
                if (!a?.data) continue;
                attachments.push(
                    await saveUpload(
                        a.data,
                        a.name ?? 'file',
                        a.mimeType ?? 'application/octet-stream',
                    ),
                );
            }
        }

        const handle = await deps.startDispatch({ text: body.text, attachments });
        return c.json({ dispatchId: handle.dispatchId, steered: handle.steered });
    });

    app.post('/v1/nero/cancel', async (c) => {
        return c.json({ cancelled: await deps.cancelActive() });
    });

    return app;
}
