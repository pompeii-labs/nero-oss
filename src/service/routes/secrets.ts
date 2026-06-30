import { Hono } from 'hono';
import { Secret } from '../../models/secret';
import { error } from '../../util/errors';

/** Secret pool control plane. The user sets values here out of band so they never
 *  pass through the model or chat history. GET returns names + metadata only,
 *  never values. This route is local/trusted; values are write-only from here. */
export function secretRoutes(): Hono {
    const app = new Hono();

    app.get('/v1/secrets', async (c) => {
        try {
            return c.json({ secrets: await Secret.listMeta() });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    app.post('/v1/secrets', async (c) => {
        try {
            const b = (await c.req.json().catch(() => ({}))) as { key?: string; value?: string };
            const key = (b.key ?? '').trim();
            if (!key) return error(c, 400, 'key required');
            if (typeof b.value !== 'string') return error(c, 400, 'value required');
            await Secret.set(key, b.value);
            return c.json({ ok: true });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    app.delete('/v1/secrets/:key', async (c) => {
        try {
            await Secret.remove(c.req.param('key'));
            return c.json({ ok: true });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    return app;
}
