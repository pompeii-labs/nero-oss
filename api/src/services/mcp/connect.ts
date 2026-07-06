import { loadConfig } from '@nero/shared/config';
import { McpConnection } from '../../models/mcp-connection';
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

export interface StartConnectResult {
    status: 'connected' | 'auth_required' | 'error';
    authUrl?: string;
    message: string;
}

/** Orchestrates connecting MCP servers: API-key/open servers connect immediately,
 *  OAuth servers register + hand back an auth URL, and the callback completes them. */
export class McpConnect {
    // In-memory pending OAuth flows, keyed by `state`. The callback completes them.
    private static pending = new Map<string, Pending>();

    private static callbackUri(): string {
        return `http://localhost:${loadConfig().port}/v1/mcp/callback`;
    }

    private static async connectStored(name: string): Promise<{ ok: boolean; message: string }> {
        const conn = await McpConnection.getByName(name);
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

    /** Begin connecting an MCP server. API key or open server -> connect now. OAuth
     *  server -> register + return an auth URL for the user to click. */
    static async start(input: {
        name: string;
        url: string;
        apiKey?: string;
    }): Promise<StartConnectResult> {
        if (input.apiKey) {
            await McpConnection.upsert({
                name: input.name,
                url: input.url,
                transport: 'http',
                auth: { apiKey: input.apiKey },
            });
            const r = await McpConnect.connectStored(input.name);
            return { status: r.ok ? 'connected' : 'error', message: r.message };
        }

        const meta = await discoverOAuthMetadata(input.url);
        if (!meta?.authServer) {
            // No OAuth advertised: try connecting as an open server.
            await McpConnection.upsert({ name: input.name, url: input.url, transport: 'http' });
            const r = await McpConnect.connectStored(input.name);
            return { status: r.ok ? 'connected' : 'error', message: r.message };
        }

        const redirectUri = McpConnect.callbackUri();
        const registration = await registerClient(meta.authServer, 'Nero', redirectUri);
        if (!registration) {
            return {
                status: 'error',
                message: `${input.name} requires OAuth but does not support dynamic client registration.`,
            };
        }

        const scope =
            meta.authServer.scopes_supported?.join(' ') ||
            meta.resource?.scopes_supported?.join(' ');
        const auth = buildAuthorizationUrl({
            authServer: meta.authServer,
            clientId: registration.client_id,
            redirectUri,
            scope,
        });
        McpConnect.pending.set(auth.state, {
            name: input.name,
            serverUrl: input.url,
            clientId: registration.client_id,
            codeVerifier: auth.codeVerifier,
            redirectUri,
            authServer: meta.authServer,
            registration,
        });
        await McpConnection.upsert({ name: input.name, url: input.url, transport: 'http' });

        return {
            status: 'auth_required',
            authUrl: auth.authUrl,
            message: `Authorize ${input.name} by opening: ${auth.authUrl}`,
        };
    }

    /** Complete an OAuth flow from the callback (exchange code -> store tokens -> connect). */
    static async complete(
        state: string,
        code: string,
    ): Promise<{ ok: boolean; name?: string; message: string }> {
        const p = McpConnect.pending.get(state);
        if (!p) return { ok: false, message: 'Unknown or expired authorization state.' };
        McpConnect.pending.delete(state);

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
        await McpConnection.updateAuth(p.name, { oauth });
        const r = await McpConnect.connectStored(p.name);
        return { ok: r.ok, name: p.name, message: r.message };
    }

    /** Reconnect a stored connection (uses saved auth). */
    static reconnect(name: string): Promise<{ ok: boolean; message: string }> {
        return McpConnect.connectStored(name);
    }

    static async disconnect(name: string): Promise<string> {
        await getMcpClient().disconnect(name);
        await McpConnection.removeByName(name);
        return `Disconnected ${name}.`;
    }
}
