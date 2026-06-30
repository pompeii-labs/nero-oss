import { Hono } from 'hono';
import { Secret } from '../../models/secret';

/** Secret pool control plane. The user sets values here out of band so they never
 *  pass through the model or chat history. GET returns names + metadata only,
 *  never values. This route is local/trusted; values are write-only from here. */
export function secretRoutes(): Hono {
    const app = new Hono();

    app.get('/v1/secrets', async (c) => {
        return c.json({ secrets: await Secret.listMeta() });
    });

    app.post('/v1/secrets', async (c) => {
        const b = (await c.req.json().catch(() => ({}))) as { key?: string; value?: string };
        const key = (b.key ?? '').trim();
        if (!key) return c.json({ error: 'key required' }, 400);
        if (typeof b.value !== 'string') return c.json({ error: 'value required' }, 400);
        await Secret.set(key, b.value);
        return c.json({ ok: true });
    });

    app.delete('/v1/secrets/:key', async (c) => {
        await Secret.remove(c.req.param('key'));
        return c.json({ ok: true });
    });

    return app;
}
