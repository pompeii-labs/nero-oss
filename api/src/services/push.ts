import { getLux, unwrap } from '@nero/shared/lux';
import type { LuxPushNotification } from '@luxdb/sdk';

/**
 * Native push via Lux (`db.push`). Lux stores device tokens and delivers to APNs /
 * Web Push directly, using the credentials configured in Lux Studio -> Push. Nero is
 * single-user, so every device registers under one opaque subject.
 */
export const PUSH_SUBJECT = 'owner';

/** Register a device token for this Nero (idempotent on the Lux side). */
export async function registerDevice(token: string, platform = 'ios'): Promise<void> {
    unwrap(await getLux().push.registerFor(PUSH_SUBJECT, { token, platform }));
}

/** Drop a device by its push token (e.g. on unregister). */
export async function unregisterDevice(token: string): Promise<void> {
    await getLux().push.unregisterByToken(token);
}

/** Enqueue a notification to all of the owner's devices; returns how many. */
export async function sendPush(n: LuxPushNotification): Promise<number> {
    const res = unwrap(await getLux().push.send(PUSH_SUBJECT, n));
    return res?.enqueued ?? 0;
}
