import { Hono } from 'hono';
import * as devices from '../../data/devices';
import * as presence from '../../data/presence';

/** Device + presence writes. Reads/subscriptions happen straight from Lux in the
 *  web (publishable key); these are the secret-key writes a browser can't do. */
export function displayRoutes(): Hono {
    const app = new Hono();

    app.post('/v1/devices/register', async (c) => {
        const b = (await c.req.json().catch(() => ({}))) as {
            id?: string;
            name?: string;
            kind?: string;
            screenW?: number;
            screenH?: number;
        };
        if (!b.id) return c.json({ error: 'id required' }, 400);
        const d = await devices.register({
            id: b.id,
            requestedName: b.name,
            kind: b.kind,
            screenW: b.screenW ?? 0,
            screenH: b.screenH ?? 0,
        });
        return c.json(d);
    });

    app.post('/v1/devices/heartbeat', async (c) => {
        const b = (await c.req.json().catch(() => ({}))) as { id?: string };
        if (b.id) await devices.heartbeat(b.id);
        return c.json({ ok: true });
    });

    // Bring Nero (the orb) to a device.
    app.post('/v1/presence', async (c) => {
        const b = (await c.req.json().catch(() => ({}))) as { deviceId?: string };
        if (!b.deviceId) return c.json({ error: 'deviceId required' }, 400);
        await presence.set(b.deviceId);
        return c.json({ ok: true, deviceId: b.deviceId });
    });

    app.get('/v1/presence', async (c) => c.json({ deviceId: await presence.get() }));

    return app;
}
