import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { spawn, ChildProcess } from 'child_process';
import chalk from 'chalk';
import type { McpServerConfig } from '../config.js';
import { updateMcpServerOAuth } from '../config.js';
import { isTokenExpired, refreshAccessToken, discoverOAuthMetadata } from './oauth.js';
import { VERSION } from '../util/version.js';

interface McpTool {
    name: string;
    description?: string;
    inputSchema?: object;
    serverName: string;
}

interface McpServer {
    name: string;
    config: McpServerConfig;
    client: Client;
    transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport;
    process?: ChildProcess;
    tools: McpTool[];
}

export class McpClient {
    private servers: Map<string, McpServer> = new Map();
    private serverConfigs: Record<string, McpServerConfig>;

    constructor(serverConfigs: Record<string, McpServerConfig>) {
        this.serverConfigs = serverConfigs;
    }

    async connect(): Promise<void> {
        const serverNames = Object.keys(this.serverConfigs);

        if (serverNames.length === 0) {
            console.log(chalk.dim('[mcp] No servers configured'));
            return;
        }

        for (const name of serverNames) {
            const config = this.serverConfigs[name];
            if (config.disabled) {
                console.log(chalk.dim(`[mcp] Skipping disabled server: ${name}`));
                continue;
            }
            try {
                await this.connectServer(name, config);
            } catch (error) {
                const err = error as Error;
                console.error(chalk.yellow(`[mcp] Failed to connect to ${name}: ${err.message}`));
            }
        }
    }

    private async connectServer(name: string, config: McpServerConfig): Promise<void> {
        const client = new Client({
            name: `nero-${name}`,
            version: VERSION,
        }, {
            capabilities: {},
        });

        let transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport;
        let proc: ChildProcess | undefined;

        if (config.transport === 'http' && config.url) {
            const url = new URL(config.url);
            const headers: Record<string, string> = { ...config.headers };

            if (config.oauth?.tokens) {
                let tokens = config.oauth.tokens;

                if (isTokenExpired(tokens) && tokens.refresh_token) {
                    console.log(chalk.dim(`[mcp] Refreshing token for ${name}...`));
                    const newTokens = await refreshAccessToken(
                        config.oauth.authServerMetadata,
                        config.oauth.clientRegistration.client_id,
                        tokens.refresh_token
                    );

                    if (newTokens) {
                        tokens = newTokens;
                        config.oauth.tokens = tokens;
                        await updateMcpServerOAuth(name, config.oauth);
                        console.log(chalk.dim(`[mcp] Token refreshed for ${name}`));
                    } else {
                        console.log(chalk.yellow(`[mcp] Failed to refresh token for ${name}, may need to re-authenticate`));
                    }
                }

                headers['Authorization'] = `Bearer ${tokens.access_token}`;
            } else {
                const oauthMetadata = await discoverOAuthMetadata(config.url);
                if (oauthMetadata?.authServer) {
                    console.log(chalk.yellow(`[mcp] Server ${name} requires authentication. Run: nero mcp auth ${name}`));
                }
            }

            console.log(chalk.dim(`[mcp] Connecting to ${name} via HTTP...`));
            console.log(chalk.dim(`[mcp] URL: ${config.url}`));
            if (headers['Authorization']) {
                console.log(chalk.dim(`[mcp] Using Bearer token authentication`));
            }

            transport = new StreamableHTTPClientTransport(url, {
                requestInit: {
                    headers,
                },
            });
        } else if (config.command) {
            const env = { ...process.env, ...config.env } as Record<string, string>;

            proc = spawn(config.command, config.args || [], {
                env,
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            transport = new StdioClientTransport({
                command: config.command,
                args: config.args,
                env,
            });
            console.log(chalk.dim(`[mcp] Connecting to ${name} via stdio...`));
        } else {
            throw new Error(`Invalid config for ${name}: missing command or url`);
        }

        const connectTimeout = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Connection timeout after 30s')), 30000);
        });

        try {
            await Promise.race([client.connect(transport), connectTimeout]);
        } catch (error) {
            const err = error as Error;
            console.error(chalk.red(`[mcp] Connection error for ${name}: ${err.message}`));
            throw err;
        }

        console.log(chalk.dim(`[mcp] Connected, fetching tools...`));
        const toolsResult = await client.listTools();
        const tools: McpTool[] = (toolsResult.tools || []).map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            serverName: name,
        }));

        this.servers.set(name, {
            name,
            config,
            client,
            transport,
            process: proc,
            tools,
        });

        console.log(chalk.dim(`[mcp] Connected to ${name} (${tools.length} tools)`));
    }

    async disconnect(): Promise<void> {
        for (const [name, server] of this.servers) {
            try {
                await server.client.close();
                if (server.process) {
                    server.process.kill();
                }
                console.log(chalk.dim(`[mcp] Disconnected from ${name}`));
            } catch (error) {
                const err = error as Error;
                console.error(chalk.dim(`[mcp] Error disconnecting ${name}: ${err.message}`));
            }
        }
        this.servers.clear();
    }

    async getTools(): Promise<McpTool[]> {
        const allTools: McpTool[] = [];
        for (const server of this.servers.values()) {
            allTools.push(...server.tools);
        }
        return allTools;
    }

    getToolNames(): string[] {
        const names: string[] = [];
        for (const server of this.servers.values()) {
            names.push(...server.tools.map(t => `${server.name}:${t.name}`));
        }
        return names;
    }

    async checkOAuthRequired(serverName: string): Promise<{
        required: boolean;
        authenticated: boolean;
        metadata?: Awaited<ReturnType<typeof discoverOAuthMetadata>>;
    }> {
        const config = this.serverConfigs[serverName];
        if (!config || config.transport !== 'http' || !config.url) {
            return { required: false, authenticated: false };
        }

        if (config.oauth?.tokens) {
            return { required: true, authenticated: true };
        }

        const metadata = await discoverOAuthMetadata(config.url);
        return {
            required: !!metadata?.authServer,
            authenticated: false,
            metadata: metadata || undefined,
        };
    }

    getServerConfig(name: string): McpServerConfig | undefined {
        return this.serverConfigs[name];
    }

    async callTool(toolName: string, args: Record<string, unknown>): Promise<string> {
        let serverName: string | null = null;
        let actualToolName = toolName;

        if (toolName.includes(':')) {
            [serverName, actualToolName] = toolName.split(':');
        }

        for (const server of this.servers.values()) {
            if (serverName && server.name !== serverName) continue;

            const tool = server.tools.find(t => t.name === actualToolName);
            if (tool) {
                try {
                    const result = await server.client.callTool({
                        name: actualToolName,
                        arguments: args,
                    });

                    if (result.content && Array.isArray(result.content)) {
                        return result.content
                            .map(c => {
                                if (c.type === 'text') return c.text;
                                return JSON.stringify(c);
                            })
                            .join('\n');
                    }

                    return JSON.stringify(result);
                } catch (error) {
                    const err = error as Error;
                    return `Error calling ${toolName}: ${err.message}`;
                }
            }
        }

        return `Tool not found: ${toolName}`;
    }
}
