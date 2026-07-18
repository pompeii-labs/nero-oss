import { Hono } from 'hono';
import { registerDevice, unregisterDevice } from '../services/push';
import { error } from '../util/errors';

/** Device push-token registration for the native apps. The app POSTs its APNs
 *  token here on launch; it registers with Lux native push, which delivers. */
export function pushRoutes(): Hono {
    const app = new Hono();

    app.post('/v1/push/register', async (c) => {
        try {
            const b = await c.req.json<{ token?: string; platform?: string }>();
            if (!b.token) return error(c, 400, 'token is required');
            await registerDevice(b.token, b.platform ?? 'ios');
            return c.json({ ok: true });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    app.post('/v1/push/unregister', async (c) => {
        try {
            const b = await c.req.json<{ token?: string }>();
            if (b.token) await unregisterDevice(b.token);
            return c.json({ ok: true });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    return app;
}
