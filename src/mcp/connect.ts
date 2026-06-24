import { loadConfig } from '../config';
import * as mcpData from '../data/mcp';
import { getMcpClient } from './client';
import {
    discoverOAuthMetadata,
    registerClient,
    buildAuthorizationUrl,
    exchangeCodeForTokens,
    type OAuthAuthorizationServerMetadata,
    type OAuthClientRegistration,
    type StoredOAuthData,
} from './oauth';

interface Pending {
    name: string;
    serverUrl: string;
    clientId: string;
    codeVerifier: string;
    redirectUri: string;
    authServer: OAuthAuthorizationServerMetadata;
    registration: OAuthClientRegistration;
}

// In-memory pending OAuth flows, keyed by `state`. The callback completes them.
const pending = new Map<string, Pending>();

function callbackUri(): string {
    return `http://localhost:${loadConfig().port}/v1/mcp/callback`;
}

async function connectStored(name: string): Promise<{ ok: boolean; message: string }> {
    const conn = await mcpData.getByName(name);
    if (!conn) return { ok: false, message: `Connection ${name} not found.` };
    try {
        await getMcpClient().connectOne(conn);
        const tools = getMcpClient()
            .getTools()
            .filter((t) => t.server === name).length;
        return { ok: true, message: `Connected ${name} (${tools} tools).` };
    } catch (e) {
        return { ok: false, message: `Failed to connect ${name}: ${(e as Error).message}` };
    }
}

export interface StartConnectResult {
    status: 'connected' | 'auth_required' | 'error';
    authUrl?: string;
    message: string;
}

/** Begin connecting an MCP server. API key or open server → connect now. OAuth
 *  server → register + return an auth URL for the user to click. */
export async function startConnect(input: {
    name: string;
    url: string;
    apiKey?: string;
}): Promise<StartConnectResult> {
    if (input.apiKey) {
        await mcpData.upsert({
            name: input.name,
            url: input.url,
            transport: 'http',
            auth: { apiKey: input.apiKey },
        });
        const r = await connectStored(input.name);
        return { status: r.ok ? 'connected' : 'error', message: r.message };
    }

    const meta = await discoverOAuthMetadata(input.url);
    if (!meta?.authServer) {
        // No OAuth advertised: try connecting as an open server.
        await mcpData.upsert({ name: input.name, url: input.url, transport: 'http' });
        const r = await connectStored(input.name);
        return { status: r.ok ? 'connected' : 'error', message: r.message };
    }

    const redirectUri = callbackUri();
    const registration = await registerClient(meta.authServer, 'Nero', redirectUri);
    if (!registration) {
        return {
            status: 'error',
            message: `${input.name} requires OAuth but does not support dynamic client registration.`,
        };
    }

    const scope =
        meta.authServer.scopes_supported?.join(' ') || meta.resource?.scopes_supported?.join(' ');
    const auth = buildAuthorizationUrl({
        authServer: meta.authServer,
        clientId: registration.client_id,
        redirectUri,
        scope,
    });
    pending.set(auth.state, {
        name: input.name,
        serverUrl: input.url,
        clientId: registration.client_id,
        codeVerifier: auth.codeVerifier,
        redirectUri,
        authServer: meta.authServer,
        registration,
    });
    await mcpData.upsert({ name: input.name, url: input.url, transport: 'http' });

    return {
        status: 'auth_required',
        authUrl: auth.authUrl,
        message: `Authorize ${input.name} by opening: ${auth.authUrl}`,
    };
}

/** Complete an OAuth flow from the callback (exchange code → store tokens → connect). */
export async function completeConnect(
    state: string,
    code: string,
): Promise<{ ok: boolean; name?: string; message: string }> {
    const p = pending.get(state);
    if (!p) return { ok: false, message: 'Unknown or expired authorization state.' };
    pending.delete(state);

    const tokens = await exchangeCodeForTokens(
        p.authServer,
        p.clientId,
        code,
        p.codeVerifier,
        p.redirectUri,
    );
    if (!tokens) return { ok: false, name: p.name, message: 'Token exchange failed.' };

    const oauth: StoredOAuthData = {
        serverUrl: p.serverUrl,
        clientRegistration: p.registration,
        tokens,
        authServerMetadata: p.authServer,
    };
    await mcpData.updateAuth(p.name, { oauth });
    const r = await connectStored(p.name);
    return { ok: r.ok, name: p.name, message: r.message };
}

/** Reconnect a stored connection (uses saved auth). */
export async function reconnect(name: string): Promise<{ ok: boolean; message: string }> {
    return connectStored(name);
}

export async function disconnect(name: string): Promise<string> {
    await getMcpClient().disconnect(name);
    await mcpData.remove(name);
    return `Disconnected ${name}.`;
}
