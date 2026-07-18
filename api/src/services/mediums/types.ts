export type Urgency = 'low' | 'normal' | 'high';

/** Something Nero wants to put in front of the user when they're off-screen. */
export interface Notification {
    title: string;
    body: string;
    urgency?: Urgency;
    /** Optional link to open when the notification is tapped. */
    url?: string;
}

/** A channel Nero can reach the user through. A medium is "available" only when
 *  its required secret is set, so configuration is just setting a secret. */
export interface Medium {
    name: string;
    displayName: string;
    /** Interruptive channels (push) are gated by user presence x urgency: skipped for
     *  `normal` when the user is on-screen, always fired for `high`. Async inboxes
     *  (slack/sms/email) leave this false and always deliver. */
    interruptive?: boolean;
    available(secrets: Record<string, string>): boolean;
    send(n: Notification, secrets: Record<string, string>): Promise<void>;
}

/** Whether an interruptive medium should fire, given urgency + on-screen presence. */
export function shouldInterrupt(urgency: Urgency, present: boolean): boolean {
    if (urgency === 'low') return false;
    if (urgency === 'high') return true;
    return !present; // normal: only when away
}
