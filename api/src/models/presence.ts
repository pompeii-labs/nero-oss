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

    /**
     * Move Nero to a device. `wake` marks a wakeword-race win: it stamps `wake_at` so
     * the winning device auto-engages voice. A plain move (user summon / move_to tool)
     * leaves `wake_at` untouched, so it just relocates the orb.
     */
    static async set(deviceId: string, opts: { wake?: boolean } = {}): Promise<void> {
        const t = getLux().table('presence');
        const existing = unwrap(await t.select().eq('id', Presence.NERO).limit(1)) as PresenceRow[];
        const body: Record<string, unknown> = {
            id: Presence.NERO,
            device_id: deviceId,
            updated_at: Date.now(),
        };
        if (opts.wake) body.wake_at = Date.now();
        if (existing.length) unwrap(await t.update(body as never).eq('id', Presence.NERO));
        else unwrap(await t.insert(body as never));
    }
}
