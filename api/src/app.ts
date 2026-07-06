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
import { panelRoutes } from './routes/panels';
import { secretRoutes } from './routes/secrets';
import { askRoutes } from './routes/ask';
import { projectRoutes } from './routes/projects';
import { mediumRoutes } from './routes/mediums';
import { browserRoutes } from './routes/browser';
import { Dispatcher } from './services/harness/dispatch';

/** Build the Nero Hono app. Deps are injectable for tests. The WebSocket
 *  upgrader (for `/v1/voice`) is supplied by the Bun server; tests omit it. */
export function createApp(deps: Partial<NeroDeps> = {}, upgradeWebSocket?: UpgradeWebSocket): Hono {
    const app = new Hono();
    app.use('*', cors());

    app.route('/', metaRoutes());
    app.route(
        '/',
        neroRoutes({
            startDispatch: deps.startDispatch ?? Dispatcher.start,
            cancelActive: deps.cancelActive ?? Dispatcher.cancelActive,
        }),
    );
    app.route('/', fileRoutes());
    app.route('/', mcpRoutes());
    app.route('/', settingsRoutes());
    app.route('/', displayRoutes());
    app.route('/', panelRoutes());
    app.route('/', secretRoutes());
    app.route('/', askRoutes());
    app.route('/', projectRoutes());
    app.route('/', mediumRoutes());
    if (upgradeWebSocket) {
        app.route('/', voiceRoutes(upgradeWebSocket));
        app.route('/', browserRoutes(upgradeWebSocket));
    }

    app.notFound((c) => c.json({ error: 'not found' }, 404));
    return app;
}
