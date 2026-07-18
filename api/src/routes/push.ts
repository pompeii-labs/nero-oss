import { Hono } from 'hono';
import { PushToken } from '../models/push-token';
import { error } from '../util/errors';

/** Device push-token registration for the native apps. The app POSTs its APNs
 *  token here on launch; Nero's apns medium delivers notifications to it. */
export function pushRoutes(): Hono {
    const app = new Hono();

    app.post('/v1/push/register', async (c) => {
        try {
            const b = await c.req.json<{ token?: string; platform?: string; bundle_id?: string }>();
            if (!b.token) return error(c, 400, 'token is required');
            await PushToken.register(b.token, b.platform ?? 'ios', b.bundle_id);
            return c.json({ ok: true });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    app.post('/v1/push/unregister', async (c) => {
        try {
            const b = await c.req.json<{ token?: string }>();
            if (b.token) await PushToken.remove(b.token);
            return c.json({ ok: true });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    return app;
}
