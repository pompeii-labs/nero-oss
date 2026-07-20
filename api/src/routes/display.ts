import { Hono } from 'hono';
import { Device } from '../models/device';
import { Presence } from '../models/presence';
import { wakeArbiter } from '../services/presence/arbiter';
import { userHeartbeat } from '../services/user-presence';
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

    // All known devices (Settings > Devices). Most-recently-seen first.
    app.get('/v1/devices', async (c) => {
        try {
            return c.json({ devices: await Device.listAll() });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    // Rename a device (Settings > Devices). A user name sticks across re-registers.
    app.post('/v1/devices/rename', async (c) => {
        try {
            const b = (await c.req.json().catch(() => ({}))) as { id?: string; name?: string };
            if (!b.id || !b.name?.trim()) return error(c, 400, 'id and name required');
            await Device.rename(b.id, b.name);
            return c.json({ ok: true });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    // Forget a device (remove it from the registry).
    app.post('/v1/devices/forget', async (c) => {
        try {
            const b = (await c.req.json().catch(() => ({}))) as { id?: string };
            if (!b.id) return error(c, 400, 'id required');
            await Device.forget(b.id);
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

    // A device heard the wakeword. It reports its confidence + how loud the phrase was;
    // the arbiter groups near-simultaneous reports and moves Nero to the loudest (closest).
    app.post('/v1/wake', async (c) => {
        try {
            const b = (await c.req.json().catch(() => ({}))) as {
                source?: string;
                score?: number;
                rms?: number;
            };
            if (!b.source) return error(c, 400, 'source required');
            wakeArbiter.report({
                source: b.source,
                score: Number(b.score) || 0,
                rms: Number(b.rms) || 0,
            });
            return c.json({ ok: true });
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

    // User foreground heartbeat: a surface (iOS/web) pings while Nero is on-screen so
    // notify() can suppress push. Fire-and-forget; never fail the caller.
    app.post('/v1/presence/heartbeat', async (c) => {
        try {
            await userHeartbeat();
        } catch {
            /* ignore */
        }
        return c.json({ ok: true });
    });

    return app;
}
