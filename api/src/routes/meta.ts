import { Hono, type Context } from 'hono';
import { loadConfig } from '@nero/shared/config';
import { isLuxConnected } from '@nero/shared/lux';
import { error } from '../util/errors';

/** Health + browser bootstrap (Lux url + publishable key for direct .live()). */
export function metaRoutes(): Hono {
    const app = new Hono();

    // `/health` isn't proxied by the web nginx (only /v1|/api|/webhook are), so
    // native clients that reach Nero through the web origin use the /v1 alias.
    const health = (c: Context) => {
        try {
            return c.json({ ok: true, lux: isLuxConnected() });
        } catch (err) {
            return error(c, 500, err);
        }
    };
    app.get('/health', health);
    app.get('/v1/health', health);

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
