import { createBunWebSocket } from 'hono/bun';
import { loadConfig } from '../config';
import { createApp } from './app';
import type { NeroDeps } from '../routes/nero';

export interface ServeOpts {
    port?: number;
    deps?: Partial<NeroDeps>;
}

/** Serve the Hono app on Bun, with WebSocket support for `/v1/voice`. */
export function createServer(opts: ServeOpts = {}) {
    const { upgradeWebSocket, websocket } = createBunWebSocket();
    const app = createApp(opts.deps, upgradeWebSocket);
    return Bun.serve({
        port: opts.port ?? loadConfig().port,
        // Long operations (compaction summarizes a large transcript, agent turns
        // run many seconds) must not be cut by the default 10s idle timeout.
        idleTimeout: 240,
        fetch: app.fetch,
        websocket,
    });
}
