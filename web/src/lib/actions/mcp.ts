import { get, post } from './helpers';

export interface Integration {
    name: string;
    url: string | null;
    transport: string;
    connected: boolean;
    hasAuth: boolean;
    tools: string[];
}

export interface ConnectResult {
    status: 'connected' | 'auth_required' | 'error';
    authUrl?: string;
    message: string;
}

export async function listIntegrations(): Promise<Integration[]> {
    const r = await get<{ integrations: Integration[] }>('/v1/mcp/list');
    return r.success ? r.data.integrations : [];
}

export async function connectIntegration(
    name: string,
    url: string,
    apiKey?: string,
): Promise<ConnectResult> {
    const r = await post<ConnectResult>('/v1/mcp/connect', {
        name,
        url,
        apiKey: apiKey || undefined,
    });
    return r.success ? r.data : { status: 'error', message: r.error.message };
}

export async function reconnectIntegration(
    name: string,
): Promise<{ ok: boolean; message: string }> {
    const r = await post<{ ok: boolean; message: string }>('/v1/mcp/reconnect', { name });
    return r.success ? r.data : { ok: false, message: r.error.message };
}

export async function disconnectIntegration(name: string): Promise<void> {
    await post('/v1/mcp/disconnect', { name });
}
