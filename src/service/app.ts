import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { UpgradeWebSocket } from 'hono/ws';
import { metaRoutes } from './routes/meta';
import { neroRoutes, type NeroDeps } from './routes/nero';
import { fileRoutes } from './routes/files';
import { mcpRoutes } from './routes/mcp';
import { voiceRoutes } from './routes/voice';
import { settingsRoutes } from './routes/settings';
import { displayRoutes } from './routes/display';
import { startDispatch, cancelActive } from '../harness/dispatch';

/** Build the Nero Hono app. Deps are injectable for tests. The WebSocket
 *  upgrader (for `/v1/voice`) is supplied by the Bun server; tests omit it. */
export function createApp(deps: Partial<NeroDeps> = {}, upgradeWebSocket?: UpgradeWebSocket): Hono {
    const app = new Hono();
    app.use('*', cors());

    app.route('/', metaRoutes());
    app.route(
        '/',
        neroRoutes({
            startDispatch: deps.startDispatch ?? startDispatch,
            cancelActive: deps.cancelActive ?? cancelActive,
        }),
    );
    app.route('/', fileRoutes());
    app.route('/', mcpRoutes());
    app.route('/', settingsRoutes());
    app.route('/', displayRoutes());
    if (upgradeWebSocket) app.route('/', voiceRoutes(upgradeWebSocket));

    app.notFound((c) => c.json({ error: 'not found' }, 404));
    return app;
}
