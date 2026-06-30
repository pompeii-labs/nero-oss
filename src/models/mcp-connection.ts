import { DataModel } from './datamodel';
import { getLux, unwrap } from '../lib/lux';
import type { McpConnections } from '../lux/types';
import type { StoredOAuthData } from '../mcp/oauth';

export type McpTransport = 'http' | 'sse' | 'stdio';

export interface McpAuth {
    oauth?: StoredOAuthData;
    apiKey?: string;
}

export interface McpExtraConfig {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    headers?: Record<string, string>;
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
