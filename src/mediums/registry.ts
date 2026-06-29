import { loadMap } from '../data/secrets';
import * as activity from '../data/medium-activity';
import { pushMedium } from './push';
import type { Medium, Notification } from './types';

/** Every channel Nero can reach the user through. Add a medium here to wire it in. */
export const MEDIUMS: Medium[] = [pushMedium];

export interface MediumStatus {
    name: string;
    displayName: string;
    available: boolean;
}

export async function mediumStatuses(): Promise<MediumStatus[]> {
    const secrets = await loadMap();
    return MEDIUMS.map((m) => ({
        name: m.name,
        displayName: m.displayName,
        available: m.available(secrets),
    }));
}

export interface NotifyResult {
    delivered: string[];
    failed: { name: string; error: string }[];
}

/** Send a notification through every available medium, auditing each attempt. */
export async function notify(n: Notification): Promise<NotifyResult> {
    const secrets = await loadMap();
    const delivered: string[] = [];
    const failed: { name: string; error: string }[] = [];
    const urgency = n.urgency ?? 'normal';

    for (const m of MEDIUMS) {
        if (!m.available(secrets)) continue;
        try {
            await m.send(n, secrets);
            delivered.push(m.name);
            await activity.log({
                medium: m.name,
                title: n.title,
                body: n.body,
                urgency,
                status: 'sent',
            });
        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            failed.push({ name: m.name, error });
            await activity.log({
                medium: m.name,
                title: n.title,
                body: n.body,
                urgency,
                status: 'error',
                error,
            });
        }
    }
    return { delivered, failed };
}
