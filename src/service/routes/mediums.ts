import { Hono } from 'hono';
import { Mediums } from '../../mediums/registry';
import { MediumActivity } from '../../models/medium-activity';
import { error } from '../../util/errors';

/** Read-only view of Nero's outbound channels and recent deliveries (for a future
 *  Workshop page). Channel config itself is just secrets (e.g. NTFY_TOPIC). */
export function mediumRoutes(): Hono {
    const app = new Hono();

    app.get('/v1/mediums', async (c) => {
        try {
            const [channels, recent] = await Promise.all([
                Mediums.statuses(),
                MediumActivity.recent(20).catch(() => []),
            ]);
            return c.json({ channels, recent });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    return app;
}
