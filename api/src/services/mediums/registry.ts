import { Secret } from '../../models/secret';
import { MediumActivity } from '../../models/medium-activity';
import { pushMedium } from './push';
import type { Medium, Notification } from './types';

export interface MediumStatus {
    name: string;
    displayName: string;
    available: boolean;
}

export interface NotifyResult {
    delivered: string[];
    failed: { name: string; error: string }[];
}

/** The outbound notification layer: every channel Nero can reach the user through,
 *  plus delivery + audit. Add a medium to `channels` to wire it in. */
export class Mediums {
    static readonly channels: Medium[] = [pushMedium];

    static async statuses(): Promise<MediumStatus[]> {
        const secrets = await Secret.loadMap();
        return Mediums.channels.map((m) => ({
            name: m.name,
            displayName: m.displayName,
            available: m.available(secrets),
        }));
    }

    /** Send a notification through every available medium, auditing each attempt. */
    static async notify(n: Notification): Promise<NotifyResult> {
        const secrets = await Secret.loadMap();
        const delivered: string[] = [];
        const failed: { name: string; error: string }[] = [];
        const urgency = n.urgency ?? 'normal';

        for (const m of Mediums.channels) {
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
}
