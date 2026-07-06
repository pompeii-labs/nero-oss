import { getLux, unwrap } from '@nero/shared/lux';
import type { Presence as PresenceRow } from '@nero/shared/types';

/**
 * The orb is a single entity that lives on exactly one device at a time. One row
 * (id='nero') points at the device it's currently on. Singleton, so a standalone
 * class rather than a DataModel.
 */
export class Presence {
    private static readonly NERO = 'nero';

    static async get(): Promise<string | null> {
        const rows = unwrap(
            await getLux().table('presence').select().eq('id', Presence.NERO).limit(1),
        ) as PresenceRow[];
        return rows.length ? (rows[0].device_id ?? null) : null;
    }

    /** Move Nero to a device (the user "bringing him here", or his own move_to tool). */
    static async set(deviceId: string): Promise<void> {
        const t = getLux().table('presence');
        const existing = unwrap(await t.select().eq('id', Presence.NERO).limit(1)) as PresenceRow[];
        const body = { id: Presence.NERO, device_id: deviceId, updated_at: Date.now() };
        if (existing.length) unwrap(await t.update(body as never).eq('id', Presence.NERO));
        else unwrap(await t.insert(body as never));
    }
}
