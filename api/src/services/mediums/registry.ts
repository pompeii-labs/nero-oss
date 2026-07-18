import { Secret } from '../../models/secret';
import { MediumActivity } from '../../models/medium-activity';
import { apnsMedium } from './apns';
import { shouldInterrupt, type Medium, type Notification } from './types';
import { isUserPresent } from '../user-presence';

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
    static readonly channels: Medium[] = [apnsMedium];

    static async statuses(): Promise<MediumStatus[]> {
        const secrets = await Secret.loadMap();
        return Mediums.channels.map((m) => ({
            name: m.name,
            displayName: m.displayName,
            available: m.available(secrets),
        }));
    }

    /**
     * Send a notification through every available medium, auditing each attempt.
     * Interruptive channels (push) are gated by presence x urgency so we don't buzz
     * the user while they're on-screen. `opts.only` restricts to named channels (e.g.
     * a reply nudge that should push but not hit Slack).
     */
    static async notify(n: Notification, opts?: { only?: string[] }): Promise<NotifyResult> {
        const secrets = await Secret.loadMap();
        const delivered: string[] = [];
        const failed: { name: string; error: string }[] = [];
        const urgency = n.urgency ?? 'normal';
        // Only pay the presence check when an interruptive channel might be gated.
        const present = urgency === 'high' ? false : await isUserPresent();

        for (const m of Mediums.channels) {
            if (opts?.only && !opts.only.includes(m.name)) continue;
            if (!m.available(secrets)) continue;
            if (m.interruptive && !shouldInterrupt(urgency, present)) continue;
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
