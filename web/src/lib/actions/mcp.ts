import { getServerUrl, buildServerResponse, type ServerResponse } from './helpers';

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

export async function getMcpServers(): Promise<ServerResponse<McpServersResponse>> {
    try {
        const response = await fetch(getServerUrl('/api/mcp/servers'));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return buildServerResponse({ data });
    } catch (e) {
        return buildServerResponse({ error: (e as Error).message });
    }
}

export async function addMcpServer(
    name: string,
    config: McpServerConfig,
): Promise<ServerResponse<void>> {
    try {
        const response = await fetch(getServerUrl('/api/mcp/servers'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, config }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return buildServerResponse({ data: undefined });
    } catch (e) {
        return buildServerResponse({ error: (e as Error).message });
    }
}

export async function removeMcpServer(name: string): Promise<ServerResponse<void>> {
    try {
        const response = await fetch(getServerUrl(`/api/mcp/servers/${encodeURIComponent(name)}`), {
            method: 'DELETE',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return buildServerResponse({ data: undefined });
    } catch (e) {
        return buildServerResponse({ error: (e as Error).message });
    }
}

export async function toggleMcpServer(
    name: string,
    disabled: boolean,
): Promise<ServerResponse<void>> {
    try {
        const response = await fetch(
            getServerUrl(`/api/mcp/servers/${encodeURIComponent(name)}/toggle`),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ disabled }),
            },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return buildServerResponse({ data: undefined });
    } catch (e) {
        return buildServerResponse({ error: (e as Error).message });
    }
}
