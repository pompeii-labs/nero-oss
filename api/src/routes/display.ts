import { Hono } from 'hono';
import { Device } from '../models/device';
import { Presence } from '../models/presence';
import { error } from '../util/errors';

/** Device + presence writes. Reads/subscriptions happen straight from Lux in the
 *  web (publishable key); these are the secret-key writes a browser can't do. */
export function displayRoutes(): Hono {
    const app = new Hono();

    app.post('/v1/devices/register', async (c) => {
        try {
            const b = (await c.req.json().catch(() => ({}))) as {
                id?: string;
                name?: string;
                kind?: string;
                screenW?: number;
                screenH?: number;
            };
            if (!b.id) return error(c, 400, 'id required');
            const d = await Device.register({
                id: b.id,
                requestedName: b.name,
                kind: b.kind,
                screen_w: b.screenW ?? 0,
                screen_h: b.screenH ?? 0,
            });
            return c.json(d);
        } catch (err) {
            return error(c, 500, err);
        }
    });

    app.post('/v1/devices/heartbeat', async (c) => {
        try {
            const b = (await c.req.json().catch(() => ({}))) as { id?: string };
            if (b.id) await Device.heartbeat(b.id);
            return c.json({ ok: true });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    // Opt a display into/out of ambient presence (glanceable orb + wakeword when not focused).
    app.post('/v1/devices/ambient', async (c) => {
        try {
            const b = (await c.req.json().catch(() => ({}))) as {
                id?: string;
                ambient?: boolean;
                room?: string | null;
            };
            if (!b.id) return error(c, 400, 'id required');
            await Device.setAmbient(b.id, !!b.ambient, b.room);
            return c.json({ ok: true, ambient: !!b.ambient });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    // Bring Nero (the orb) to a device.
    app.post('/v1/presence', async (c) => {
        try {
            const b = (await c.req.json().catch(() => ({}))) as { deviceId?: string };
            if (!b.deviceId) return error(c, 400, 'deviceId required');
            await Presence.set(b.deviceId);
            return c.json({ ok: true, deviceId: b.deviceId });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    app.get('/v1/presence', async (c) => {
        try {
            return c.json({ deviceId: await Presence.get() });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    return app;
}
