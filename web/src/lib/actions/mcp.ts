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
