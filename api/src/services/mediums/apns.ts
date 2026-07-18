import { isLuxConnected } from '@nero/shared/lux';
import { sendPush } from '../push';
import type { Medium, Notification } from './types';

/**
 * iOS/web push via Lux native push. Apple credentials (the `.p8` auth key, Key ID,
 * Team ID, and bundle-id topic) are configured in Lux Studio -> Push; Lux stores the
 * device tokens and delivers to APNs directly. Device tokens come from the native app
 * via POST /v1/push/register.
 */
export const apnsMedium: Medium = {
    name: 'apns',
    displayName: 'Push (iOS)',
    available: () => isLuxConnected(),
    async send(n: Notification) {
        const enqueued = await sendPush({
            title: n.title,
            body: n.body,
            data: n.url ? { url: n.url } : undefined,
        });
        if (enqueued === 0) throw new Error('push enqueued to 0 devices');
    },
};
