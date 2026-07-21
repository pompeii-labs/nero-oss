import { DataModel } from './datamodel';
import { getLux, unwrap } from '@nero/shared/lux';
import type { McpConnections } from '@nero/shared/types';
import type { StoredOAuthData, OAuthTokens } from '../services/mcp/oauth';

export type McpTransport = 'http' | 'sse' | 'stdio';

export interface McpAuth {
    oauth?: StoredOAuthData;
    apiKey?: string;
    /** API-owned OAuth tokens for a built-in integration (see api/src/mcp/oauth.ts). */
    integrationTokens?: OAuthTokens;
}

export interface McpExtraConfig {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    headers?: Record<string, string>;
    /** Vault secret names injected into a stdio server's process env at launch,
     *  as same-named env vars. Scoped: only these reach the process, not the
     *  whole vault. ${NAME} refs inside `env` values resolve from the vault too. */
    secrets?: string[];
    /** Run this stdio server on the host via the sidecar, serving HTTP (Path B),
     *  instead of in-process in the container. The server must honor MCP_HTTP_PORT.
     *  Requires a wired sidecar (NERO_RUNNER_URL); ignored in dev. */
    host?: boolean;
    /** Working directory for a host-launched stdio server (so it resolves its own
     *  node_modules). Paths may use ~ (resolved on the host). */
    cwd?: string;
    /** HTTP port assigned to a host-launched server (Path B: the sidecar runs it on
     *  the host serving HTTP, the api connects over host.docker.internal:<port>).
     *  Assigned once on first launch and reused. */
    port?: number;
    /** Set on connections that are a built-in integration (catalog id). The api owns
     *  that integration's OAuth and injects its access token at connect. */
    integration?: string;
}

export interface McpConnectionData {
    id: string;
    name: string;
    url: string | null;
    transport: McpTransport;
    auth: McpAuth | null;
    config: McpExtraConfig | null;
    disabled: boolean;
    created_at: number;
}

export interface McpUpsertInput {
    name: string;
    url?: string | null;
    transport?: McpTransport;
    auth?: McpAuth | null;
    config?: McpExtraConfig | null;
    disabled?: boolean;
}

export class McpConnection extends DataModel<McpConnectionData> {
    static readonly tableName = 'mcp_connections';

    name!: string;
    url!: string | null;
    transport!: McpTransport;
    auth!: McpAuth | null;
    config!: McpExtraConfig | null;
    disabled!: boolean;
    created_at!: number;

    constructor(data: McpConnectionData) {
        super();
        Object.assign(this, data);
    }

    static async listAll(): Promise<McpConnection[]> {
        const rows = unwrap(
            await getLux()
                .table('mcp_connections')
                .select()
                .order('created_at', { ascending: true }),
        ) as McpConnections[];
        return rows.map((r) => new McpConnection(r as unknown as McpConnectionData));
    }

    static async getByName(name: string): Promise<McpConnection | null> {
        const rows = unwrap(
            await getLux().table('mcp_connections').select().eq('name', name).limit(1),
        ) as McpConnections[];
        return rows.length ? new McpConnection(rows[0] as unknown as McpConnectionData) : null;
    }

    static async upsert(input: McpUpsertInput): Promise<McpConnection> {
        const existing = await McpConnection.getByName(input.name);
        const body: Record<string, unknown> = { name: input.name };
        if (input.url !== undefined) body.url = input.url;
        if (input.transport) body.transport = input.transport;
        if (input.auth != null) body.auth = input.auth;
        if (input.config != null) body.config = input.config;
        if (input.disabled !== undefined) body.disabled = input.disabled;

        if (existing) {
            unwrap(
                await getLux()
                    .table('mcp_connections')
                    .update(body as never)
                    .eq('id', existing.id),
            );
            return (await McpConnection.getByName(input.name))!;
        }
        const row = unwrap(
            await getLux()
                .table('mcp_connections')
                .insert(body as never),
        ) as McpConnections;
        return new McpConnection(row as unknown as McpConnectionData);
    }

    static async updateAuth(name: string, auth: McpAuth): Promise<void> {
        const existing = await McpConnection.getByName(name);
        if (!existing) return;
        await McpConnection.update(existing.id, { auth });
    }

    static async removeByName(name: string): Promise<void> {
        unwrap(await getLux().table('mcp_connections').delete().eq('name', name));
    }
}
