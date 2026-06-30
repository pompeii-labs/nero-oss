import { Secret } from '../models/secret';
import { MediumActivity } from '../models/medium-activity';
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
    const secrets = await Secret.loadMap();
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
    const secrets = await Secret.loadMap();
    const delivered: string[] = [];
    const failed: { name: string; error: string }[] = [];
    const urgency = n.urgency ?? 'normal';

    for (const m of MEDIUMS) {
        if (!m.available(secrets)) continue;
        try {
            await m.send(n, secrets);
            delivered.push(m.name);
            await MediumActivity.log({
                medium: m.name,
                title: n.title,
                body: n.body,
                urgency,
                status: 'sent',
            });
        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            failed.push({ name: m.name, error });
            await MediumActivity.log({
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
