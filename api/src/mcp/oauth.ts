import { randomBytes, createHash } from 'node:crypto';
import { Secret } from '../models/secret';
import { Settings } from '../models/settings';
import { McpConnection } from '../models/mcp-connection';
import { getIntegration, type Integration } from './catalog';
import type { OAuthTokens } from '../services/mcp/oauth';

/**
 * API-owned OAuth for built-in integrations. Nero runs the whole flow (consent link,
 * callback exchange, refresh) with the user's vault client id/secret, and the (dumb)
 * server just gets a fresh access token injected at connect. Standard OAuth2 auth-code
 * + PKCE, so it fits Google (which has no dynamic client registration).
 */

interface Pending {
    id: string;
    verifier: string;
    redirectUri: string;
}
const pending = new Map<string, Pending>();

/** Nero's public base URL, needed to build the OAuth redirect the user's browser hits. */
async function publicBase(): Promise<string> {
    const fromSettings = (await Settings.get('public_url').catch(() => null))?.trim();
    return (fromSettings || process.env.NERO_PUBLIC_URL || '').replace(/\/+$/, '');
}

function pkce() {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
}

/** Begin authorizing an integration: returns a consent link for the user to open. */
export async function startAuth(
    id: string,
): Promise<{ ok: boolean; authUrl?: string; message: string }> {
    const integ = getIntegration(id);
    if (!integ?.oauth) return { ok: false, message: `No OAuth integration "${id}".` };
    const vault = await Secret.loadMap();
    const clientId = vault[integ.oauth.clientIdKey];
    if (!clientId)
        return { ok: false, message: `Missing ${integ.oauth.clientIdKey}; set it first.` };
    const base = await publicBase();
    if (!base)
        return {
            ok: false,
            message:
                'Nero public URL is not configured (set public_url), which the OAuth callback needs.',
        };

    const redirectUri = `${base}/v1/integrations/callback`;
    const { verifier, challenge } = pkce();
    const state = randomBytes(16).toString('hex');
    pending.set(state, { id, verifier, redirectUri });

    const p = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: integ.oauth.scopes.join(' '),
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        access_type: 'offline',
        prompt: 'consent',
    });
    return {
        ok: true,
        authUrl: `${integ.oauth.authUrl}?${p.toString()}`,
        message: `Open this link to connect ${integ.name}.`,
    };
}

/** Complete the flow from the callback: exchange the code and store the tokens. */
export async function complete(
    state: string,
    code: string,
): Promise<{ ok: boolean; id?: string; message: string }> {
    const p = pending.get(state);
    if (!p) return { ok: false, message: 'Unknown or expired authorization state.' };
    pending.delete(state);
    const integ = getIntegration(p.id);
    if (!integ?.oauth) return { ok: false, id: p.id, message: 'Integration not found.' };

    const vault = await Secret.loadMap();
    const clientId = vault[integ.oauth.clientIdKey];
    const clientSecret = vault[integ.oauth.clientSecretKey];
    if (!clientId || !clientSecret)
        return { ok: false, id: p.id, message: 'Missing OAuth client credentials.' };

    const res = await fetch(integ.oauth.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            code_verifier: p.verifier,
            grant_type: 'authorization_code',
            redirect_uri: p.redirectUri,
        }),
    });
    const tokens = (await res.json().catch(() => ({}))) as OAuthTokens;
    if (!res.ok || !tokens.access_token)
        return { ok: false, id: p.id, message: `Token exchange failed: ${JSON.stringify(tokens)}` };
    tokens.issued_at = Date.now();
    await storeTokens(p.id, tokens);
    return { ok: true, id: p.id, message: `${integ.name} connected.` };
}

async function storeTokens(id: string, tokens: OAuthTokens): Promise<void> {
    const conn = await McpConnection.getByName(id);
    await McpConnection.updateAuth(id, { ...(conn?.auth ?? {}), integrationTokens: tokens });
}

function isExpired(t: OAuthTokens): boolean {
    if (!t.expires_in || !t.issued_at) return false;
    return Date.now() > t.issued_at + t.expires_in * 1000 - 60_000;
}

async function refresh(integ: Integration, refreshToken: string): Promise<OAuthTokens | null> {
    if (!integ.oauth) return null;
    const vault = await Secret.loadMap();
    const clientId = vault[integ.oauth.clientIdKey];
    const clientSecret = vault[integ.oauth.clientSecretKey];
    if (!clientId || !clientSecret) return null;
    const res = await fetch(integ.oauth.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
        }),
    });
    const t = (await res.json().catch(() => ({}))) as OAuthTokens;
    if (!res.ok || !t.access_token) return null;
    t.issued_at = Date.now();
    if (!t.refresh_token) t.refresh_token = refreshToken;
    return t;
}

/** Current access token for an integration, refreshing if expired. Used at connect. */
export async function integrationAccessToken(id: string): Promise<string | null> {
    const integ = getIntegration(id);
    const conn = await McpConnection.getByName(id);
    let tokens = conn?.auth?.integrationTokens;
    if (!integ?.oauth || !tokens) return null;
    if (isExpired(tokens) && tokens.refresh_token) {
        const refreshed = await refresh(integ, tokens.refresh_token);
        if (refreshed) {
            tokens = refreshed;
            await storeTokens(id, refreshed);
        }
    }
    return tokens.access_token ?? null;
}
