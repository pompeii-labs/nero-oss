import { getLux, unwrap } from '@nero/shared/lux';

/**
 * User *foreground* presence (distinct from the orb's device presence). Any surface
 * with Nero open (iOS app foreground, web tab visible) refreshes a short-TTL key on a
 * heartbeat; the user is "present" while the key is alive. `notify()` uses this to
 * decide push vs in-app so Nero never buzzes the phone while you're looking at him.
 */
const KEY = 'nero:user:foreground';
const TTL_SECONDS = 45; // heartbeat every ~20s; away within one missed interval

export async function userHeartbeat(): Promise<void> {
    await getLux().exec(`SET ${KEY} 1 EX ${TTL_SECONDS}`);
}

export async function isUserPresent(): Promise<boolean> {
    try {
        const res = unwrap(await getLux().exec(`EXISTS ${KEY}`));
        return res === 1 || res === '1' || res === true;
    } catch {
        return false;
    }
}
