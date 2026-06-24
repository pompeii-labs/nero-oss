import { Hono } from 'hono';
import { loadConfig } from '../../config';
import { isLuxConnected } from '../../lux/client';

/** Health + browser bootstrap (Lux url + publishable key for direct .live()). */
export function metaRoutes(): Hono {
    const app = new Hono();

    app.get('/health', (c) => c.json({ ok: true, lux: isLuxConnected() }));

    app.get('/v1/config', (c) => {
        const { lux } = loadConfig();
        return c.json({ luxUrl: lux.url, luxPublishableKey: lux.publishableKey });
    });

    return app;
}
