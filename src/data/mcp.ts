import { getLux, unwrap } from '../lux/client';
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

export interface McpConnection {
    id: string;
    name: string;
    url: string | null;
    transport: McpTransport;
    auth: McpAuth | null;
    config: McpExtraConfig | null;
    disabled: boolean;
    created_at: number;
}

function coerce(raw: McpConnections): McpConnection {
    return {
        id: raw.id,
        name: raw.name ?? '',
        url: raw.url ?? null,
        transport: (raw.transport as McpTransport) ?? 'http',
        auth: (raw.auth as McpAuth | null) ?? null,
        config: (raw.config as McpExtraConfig | null) ?? null,
        disabled: raw.disabled ?? false,
        created_at: raw.created_at ?? 0,
    };
}

export async function list(): Promise<McpConnection[]> {
    const q = getLux().table('mcp_connections').select().order('created_at', { ascending: true });
    return (unwrap(await q) as McpConnections[]).map(coerce);
}

export async function getByName(name: string): Promise<McpConnection | null> {
    const rows = unwrap(
        await getLux().table('mcp_connections').select().eq('name', name).limit(1),
    ) as McpConnections[];
    return rows.length ? coerce(rows[0]) : null;
}

export interface UpsertInput {
    name: string;
    url?: string | null;
    transport?: McpTransport;
    auth?: McpAuth | null;
    config?: McpExtraConfig | null;
    disabled?: boolean;
}

export async function upsert(input: UpsertInput): Promise<McpConnection> {
    const existing = await getByName(input.name);
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
        return (await getByName(input.name))!;
    }
    const res = await getLux()
        .table('mcp_connections')
        .insert(body as never);
    return coerce(unwrap(res) as McpConnections);
}

export async function updateAuth(name: string, auth: McpAuth): Promise<void> {
    const existing = await getByName(name);
    if (!existing) return;
    unwrap(
        await getLux()
            .table('mcp_connections')
            .update({ auth } as never)
            .eq('id', existing.id),
    );
}

export async function remove(name: string): Promise<void> {
    unwrap(await getLux().table('mcp_connections').delete().eq('name', name));
}
