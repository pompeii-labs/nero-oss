import { Hono } from 'hono';
import { loadConfig } from '@nero/shared/config';
import { isLuxConnected } from '@nero/shared/lux';
import { error } from '../util/errors';

/** Health + browser bootstrap (Lux url + publishable key for direct .live()). */
export function metaRoutes(): Hono {
    const app = new Hono();

    app.get('/health', (c) => {
        try {
            return c.json({ ok: true, lux: isLuxConnected() });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    app.get('/v1/config', (c) => {
        try {
            const { lux } = loadConfig();
            return c.json({ luxUrl: lux.publicUrl, luxPublishableKey: lux.publishableKey });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    return app;
}
