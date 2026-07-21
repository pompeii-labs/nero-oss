import { Hono } from 'hono';
import { saveUpload } from '../services/files/store';
import type { AttachmentRef } from '../models/message';
import type { Dispatcher } from '../services/harness/dispatch';
import { error } from '../util/errors';

export interface NeroDeps {
    startDispatch: typeof Dispatcher.start;
    cancelActive: typeof Dispatcher.cancelActive;
}

/** Fire-and-forget dispatch + cancel. The streamed result lands on Lux (the
 *  browser watches it via .live()), not the HTTP response. */
export function neroRoutes(deps: NeroDeps): Hono {
    const app = new Hono();

    app.post('/v1/nero', async (c) => {
        try {
            const body = (await c.req.json().catch(() => ({}))) as {
                text?: unknown;
                attachments?: Array<{ data?: string; name?: string; mimeType?: string }>;
                errand?: boolean;
            };
            const hasAttachments = Array.isArray(body.attachments) && body.attachments.length > 0;
            if (typeof body.text !== 'string' || (!body.text.trim() && !hasAttachments)) {
                return error(c, 400, 'text or an attachment required');
            }

            let attachments: AttachmentRef[] | undefined;
            if (hasAttachments && Array.isArray(body.attachments)) {
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

            const handle = await deps.startDispatch({
                text: body.text,
                attachments,
                errand: body.errand === true,
            });
            return c.json({ dispatchId: handle.dispatchId, steered: handle.steered });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    app.post('/v1/nero/cancel', async (c) => {
        try {
            return c.json({ cancelled: await deps.cancelActive() });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    return app;
}
