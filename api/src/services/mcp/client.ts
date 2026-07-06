import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpConnection } from '../../models/mcp-connection';
import { isTokenExpired, refreshAccessToken } from './oauth';

export interface McpTool {
    name: string;
    description?: string;
    inputSchema?: object;
    server: string;
}

interface ConnectedServer {
    name: string;
    client: Client;
    tools: McpTool[];
}

function timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => setTimeout(() => reject(new Error('connect timeout')), ms));
}

/** Manages live MCP client connections (one per configured server). Loads
 *  connections from Lux, refreshes OAuth tokens, exposes tools + dispatch. */
export class McpClient {
    private servers = new Map<string, ConnectedServer>();

    async connectAll(): Promise<void> {
        const conns = (await McpConnection.listAll()).filter((c) => !c.disabled);
        await Promise.allSettled(
            conns.map((c) =>
                this.connectOne(c).catch((e) =>
                    console.error(`[mcp] connect ${c.name} failed:`, e),
                ),
            ),
        );
    }

    async connectOne(conn: McpConnection): Promise<void> {
        const client = new Client(
            { name: `nero-${conn.name}`, version: '1.0.0' },
            { capabilities: {} },
        );

        let transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport;

        if ((conn.transport === 'http' || conn.transport === 'sse') && conn.url) {
            const headers: Record<string, string> = { ...(conn.config?.headers ?? {}) };

            if (conn.auth?.apiKey) {
                headers['Authorization'] = `Bearer ${conn.auth.apiKey}`;
            } else if (conn.auth?.oauth?.tokens) {
                let tokens = conn.auth.oauth.tokens;
                if (isTokenExpired(tokens) && tokens.refresh_token) {
                    const refreshed = await refreshAccessToken(
                        conn.auth.oauth.authServerMetadata,
                        conn.auth.oauth.clientRegistration.client_id,
                        tokens.refresh_token,
                    );
                    if (refreshed) {
                        tokens = refreshed;
                        conn.auth.oauth.tokens = tokens;
                        await McpConnection.updateAuth(conn.name, conn.auth);
                    }
                }
                headers['Authorization'] = `Bearer ${tokens.access_token}`;
            }

            const url = new URL(conn.url);
            transport =
                conn.transport === 'sse'
                    ? new SSEClientTransport(url, { requestInit: { headers } })
                    : new StreamableHTTPClientTransport(url, { requestInit: { headers } });
        } else if (conn.transport === 'stdio' && conn.config?.command) {
            transport = new StdioClientTransport({
                command: conn.config.command,
                args: conn.config.args ?? [],
                env: { ...process.env, ...(conn.config.env ?? {}) } as Record<string, string>,
            });
        } else {
            throw new Error(`invalid MCP config for ${conn.name}`);
        }

        await Promise.race([client.connect(transport), timeout(30_000)]);
        const result = await client.listTools();
        const tools: McpTool[] = (result.tools ?? []).map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            server: conn.name,
        }));
        this.servers.set(conn.name, { name: conn.name, client, tools });
        console.log(`[mcp] connected ${conn.name} (${tools.length} tools)`);
    }

    getTools(): McpTool[] {
        return [...this.servers.values()].flatMap((s) => s.tools);
    }

    connectedNames(): string[] {
        return [...this.servers.keys()];
    }

    isConnected(name: string): boolean {
        return this.servers.has(name);
    }

    async callTool(server: string, tool: string, args: Record<string, unknown>): Promise<string> {
        const s = this.servers.get(server);
        if (!s) return `MCP server '${server}' is not connected.`;
        try {
            const result = (await s.client.callTool({ name: tool, arguments: args })) as {
                content?: Array<{ type: string; text?: string }>;
            };
            if (Array.isArray(result.content)) {
                return result.content
                    .map((c) => (c.type === 'text' ? (c.text ?? '') : JSON.stringify(c)))
                    .join('\n');
            }
            return JSON.stringify(result);
        } catch (e) {
            return `Error calling ${server}:${tool}: ${(e as Error).message}`;
        }
    }

    async disconnect(name: string): Promise<void> {
        const s = this.servers.get(name);
        if (!s) return;
        await s.client.close().catch(() => {});
        this.servers.delete(name);
    }

    async disconnectAll(): Promise<void> {
        await Promise.allSettled([...this.servers.values()].map((s) => s.client.close()));
        this.servers.clear();
    }
}

let singleton: McpClient | null = null;
export function getMcpClient(): McpClient {
    if (!singleton) singleton = new McpClient();
    return singleton;
}
