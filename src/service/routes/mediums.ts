import { Hono } from 'hono';
import { mediumStatuses } from '../../mediums/registry';
import { MediumActivity } from '../../models/medium-activity';

/** Read-only view of Nero's outbound channels and recent deliveries (for a future
 *  Workshop page). Channel config itself is just secrets (e.g. NTFY_TOPIC). */
export function mediumRoutes(): Hono {
    const app = new Hono();

    app.get('/v1/mediums', async (c) => {
        const [channels, recent] = await Promise.all([
            mediumStatuses(),
            MediumActivity.recent(20).catch(() => []),
        ]);
        return c.json({ channels, recent });
    });

    return app;
}
