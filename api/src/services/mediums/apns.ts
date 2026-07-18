import { createPrivateKey, sign as ecSign } from 'node:crypto';
import { PushToken } from '../../models/push-token';
import type { Medium, Notification } from './types';

// Apple Push Notification service, token-based auth. Config (all secrets):
//   APNS_KEY        the .p8 auth key contents (PEM; \n-escaped is fine)
//   APNS_KEY_ID     the key's 10-char Key ID
//   APNS_TEAM_ID    the Apple Developer Team ID
//   APNS_BUNDLE_ID  the app bundle id (== apns-topic), e.g. com.pompeii.nero
//   APNS_PRODUCTION "true" for the prod gateway (App Store / TestFlight); default
//                   is the sandbox gateway, which matches a development build.
// Device tokens come from the native app via POST /v1/push/register.

function b64url(input: string | Buffer): string {
    return Buffer.from(input)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/** ES256-signed JWT for APNs (valid ~1h; we mint one per send). */
function buildJwt(keyPem: string, keyId: string, teamId: string): string {
    const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
    const payload = b64url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
    const input = `${header}.${payload}`;
    const key = createPrivateKey(keyPem);
    // ieee-p1363 yields the raw r||s signature JOSE wants (not DER).
    const sig = ecSign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' });
    return `${input}.${b64url(sig)}`;
}

interface DeliverOpts {
    jwt: string;
    bundleId: string;
    payload: string;
    host: string;
}

/** Bun's fetch negotiates HTTP/2 for https, which APNs requires. Returns which
 *  tokens are dead (410 / BadDeviceToken / Unregistered) and how many delivered. */
async function deliver(tokens: string[], o: DeliverOpts): Promise<{ gone: string[]; ok: number }> {
    const gone: string[] = [];
    let ok = 0;
    await Promise.all(
        tokens.map(async (token) => {
            try {
                const res = await fetch(`${o.host}/3/device/${token}`, {
                    method: 'POST',
                    headers: {
                        authorization: `bearer ${o.jwt}`,
                        'apns-topic': o.bundleId,
                        'apns-push-type': 'alert',
                        'content-type': 'application/json',
                    },
                    body: o.payload,
                });
                if (res.status === 200) {
                    ok++;
                    return;
                }
                const body = await res.text();
                if (
                    res.status === 410 ||
                    body.includes('BadDeviceToken') ||
                    body.includes('Unregistered')
                ) {
                    gone.push(token);
                }
            } catch {
                /* network error for this token; leave it registered, try next time */
            }
        }),
    );
    return { gone, ok };
}

export const apnsMedium: Medium = {
    name: 'apns',
    displayName: 'Push (iOS)',
    available: (s) => Boolean(s.APNS_KEY && s.APNS_KEY_ID && s.APNS_TEAM_ID && s.APNS_BUNDLE_ID),
    async send(n: Notification, s) {
        const tokens = (await PushToken.all())
            .filter((t) => t.platform === 'ios')
            .map((t) => t.token);
        if (!tokens.length) return;

        const jwt = buildJwt(
            (s.APNS_KEY || '').replace(/\\n/g, '\n'),
            s.APNS_KEY_ID,
            s.APNS_TEAM_ID,
        );
        const aps: Record<string, unknown> = {
            alert: { title: n.title, body: n.body },
            sound: 'default',
        };
        const payload = JSON.stringify(n.url ? { aps, url: n.url } : { aps });
        const prod = s.APNS_PRODUCTION === 'true' || s.APNS_PRODUCTION === '1';
        const host = prod ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';

        const { gone, ok } = await deliver(tokens, {
            jwt,
            bundleId: s.APNS_BUNDLE_ID,
            payload,
            host,
        });
        await Promise.all(gone.map((t) => PushToken.remove(t).catch(() => {})));
        if (ok === 0) throw new Error(`APNs delivered to 0/${tokens.length} tokens`);
    },
};
