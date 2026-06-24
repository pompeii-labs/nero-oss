import { getLux, unwrap } from '../lux/client';
import type { Presence } from '../lux/types';

/** The orb is a single entity that lives on exactly one device at a time. One row
 *  (id='nero') points at the device it's currently on. */
const NERO = 'nero';

export async function get(): Promise<string | null> {
    const rows = unwrap(
        await getLux().table('presence').select().eq('id', NERO).limit(1),
    ) as Presence[];
    return rows.length ? (rows[0].device_id ?? null) : null;
}

/** Move Nero to a device (the user "bringing him here", or his own move_to tool). */
export async function set(deviceId: string): Promise<void> {
    const t = getLux().table('presence');
    const existing = unwrap(await t.select().eq('id', NERO).limit(1)) as Presence[];
    const body = { id: NERO, device_id: deviceId, updated_at: Date.now() };
    if (existing.length) unwrap(await t.update(body as never).eq('id', NERO));
    else unwrap(await t.insert(body as never));
}
