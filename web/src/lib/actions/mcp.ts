import { get, post, del, type NeroResult } from './helpers';

export type McpServerConfig = {
    transport?: 'stdio' | 'http';
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
    disabled?: boolean;
};

export type McpServersResponse = {
    servers: Record<string, McpServerConfig>;
    tools: string[];
    authStatus: Record<string, boolean>;
};

export function getMcpServers(): Promise<NeroResult<McpServersResponse>> {
    return get('/api/mcp/servers');
}

export function addMcpServer(name: string, config: McpServerConfig): Promise<NeroResult<void>> {
    return post('/api/mcp/servers', { name, config });
}

export function removeMcpServer(name: string): Promise<NeroResult<void>> {
    return del(`/api/mcp/servers/${encodeURIComponent(name)}`);
}

export function toggleMcpServer(name: string, disabled: boolean): Promise<NeroResult<void>> {
    return post(`/api/mcp/servers/${encodeURIComponent(name)}/toggle`, { disabled });
}

export function startMcpAuth(name: string): Promise<NeroResult<{ authUrl: string }>> {
    return post(`/api/mcp/servers/${encodeURIComponent(name)}/auth`);
}

export function getMcpAuthStatus(
    name: string,
): Promise<NeroResult<{ authenticated: boolean; error?: string }>> {
    return get(`/api/mcp/servers/${encodeURIComponent(name)}/auth/status`);
}

export function logoutMcpServer(name: string): Promise<NeroResult<{ success: boolean }>> {
    return post(`/api/mcp/servers/${encodeURIComponent(name)}/logout`);
}
