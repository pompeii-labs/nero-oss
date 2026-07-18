import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpConnection } from '../../models/mcp-connection';
import { Secret } from '../../models/secret';
import { interpolate } from '../../util/interpolate';
import { runner } from '@nero/shared/runner';
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
        // Assign host ports up front from an in-memory set. Doing it per-connect races
        // (Lux read-after-write lag hands two servers the same free port). Collision-
        // aware so it also self-heals rows that already collided. Mutating c.config in
        // place means connectOne -> ensureHostPort returns the now-set port, no reload.
        if (process.env.NERO_RUNNER_URL) {
            const used = new Set<number>();
            for (const c of conns) {
                if (!(c.transport === 'stdio' && c.config?.command && c.config?.host)) continue;
                let port = c.config.port;
                if (!port || used.has(port)) {
                    port = 4900;
                    while (used.has(port)) port++;
                    c.config = { ...c.config, port };
                    await McpConnection.upsert({ name: c.name, config: c.config });
                }
                used.add(port);
            }
        }
        await Promise.allSettled(
            conns.map((c) =>
                this.connectOne(c).catch((e) =>
                    console.error(`[mcp] connect ${c.name} failed:`, e),
                ),
            ),
        );
    }

    async connectOne(conn: McpConnection): Promise<void> {
        // Path B: a stdio server runs on the HOST via the sidecar (host toolchains,
        // lean container), serving HTTP, with vault env injected at spawn. Only when
        // a runner is wired (containerized prod); dev falls through to in-process stdio.
        if (
            conn.transport === 'stdio' &&
            conn.config?.command &&
            conn.config?.host &&
            process.env.NERO_RUNNER_URL
        ) {
            return this.connectHostLaunched(conn);
        }

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
            // Dev / no-sidecar: run the stdio server in-process, vault env injected.
            const injected = await this.resolveStdioEnv(conn);
            transport = new StdioClientTransport({
                command: conn.config.command,
                args: conn.config.args ?? [],
                env: { ...process.env, ...injected } as Record<string, string>,
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

    /** Vault env for a stdio server: declared `secrets` become same-named env vars,
     *  and ${NAME} refs inside literal `env` values resolve. Scoped to what the
     *  server declares, the whole vault never lands in a process. */
    private async resolveStdioEnv(conn: McpConnection): Promise<Record<string, string>> {
        const vault = await Secret.loadMap();
        const injected: Record<string, string> = {};
        for (const name of conn.config?.secrets ?? []) {
            if (vault[name] !== undefined) injected[name] = vault[name];
        }
        for (const [k, v] of Object.entries(conn.config?.env ?? {})) {
            injected[k] = interpolate(v, vault);
        }
        return injected;
    }

    /** Stable HTTP port for a host-launched server. Assigned once (smallest free
     *  from 4900) and persisted on the connection so it survives restarts. */
    private async ensureHostPort(conn: McpConnection): Promise<number> {
        if (conn.config?.port) return conn.config.port;
        const used = new Set(
            (await McpConnection.listAll())
                .map((c) => c.config?.port)
                .filter((p): p is number => typeof p === 'number'),
        );
        let port = 4900;
        while (used.has(port)) port++;
        await McpConnection.upsert({ name: conn.name, config: { ...(conn.config ?? {}), port } });
        return port;
    }

    /** Path B connect: spawn the server on the host via the sidecar (vault env +
     *  an assigned HTTP port), then connect over host.docker.internal. The freshly
     *  spawned server needs a beat to bind, so retry the HTTP connect. */
    private async connectHostLaunched(conn: McpConnection): Promise<void> {
        const injected = await this.resolveStdioEnv(conn);
        const port = await this.ensureHostPort(conn);
        const token = process.env.NERO_RUNNER_TOKEN ?? '';
        await runner().spawnDaemon({
            id: conn.name,
            command: conn.config!.command!,
            args: conn.config!.args ?? [],
            cwd: conn.config!.cwd,
            env: {
                ...injected,
                MCP_HTTP_PORT: String(port),
                MCP_HTTP_HOST: '0.0.0.0',
                MCP_HTTP_TOKEN: token,
            },
        });

        const url = new URL(`http://host.docker.internal:${port}/mcp`);
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        let lastErr: unknown;
        for (let attempt = 0; attempt < 8; attempt++) {
            const client = new Client(
                { name: `nero-${conn.name}`, version: '1.0.0' },
                { capabilities: {} },
            );
            const transport = new StreamableHTTPClientTransport(url, {
                requestInit: { headers },
            });
            try {
                await client.connect(transport);
                const result = await client.listTools();
                const tools: McpTool[] = (result.tools ?? []).map((t) => ({
                    name: t.name,
                    description: t.description,
                    inputSchema: t.inputSchema,
                    server: conn.name,
                }));
                this.servers.set(conn.name, { name: conn.name, client, tools });
                console.log(
                    `[mcp] connected ${conn.name} on host :${port} (${tools.length} tools)`,
                );
                return;
            } catch (e) {
                lastErr = e;
                await client.close().catch(() => {});
                await new Promise((r) => setTimeout(r, 750));
            }
        }
        throw new Error(`host-launched ${conn.name} never came up on :${port}: ${lastErr}`);
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
        if (s) {
            await s.client.close().catch(() => {});
            this.servers.delete(name);
        }
        // Tear down the host-side process too (no-op if it isn't host-launched).
        if (process.env.NERO_RUNNER_URL)
            await runner()
                .stopDaemon(name)
                .catch(() => {});
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
