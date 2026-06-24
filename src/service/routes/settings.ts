import { Hono } from 'hono';
import { loadConfig } from '../../config';
import * as settings from '../../data/settings';
import { foldThread, MANUAL_KEEP_TOKENS } from '../../harness/compaction';
import * as compactionData from '../../data/compaction';

/** Runtime settings (single-user). GET resolves the effective values; POST sets. */
export function settingsRoutes(): Hono {
    const app = new Hono();

    // Manual compaction: force-fold the thread now, keeping an absolute recent tail
    // (a window-fraction would dwarf the session on 1M-window models). Summarizes
    // everything older. Returns the resulting summary.
    app.post('/v1/compact', async (c) => {
        const compacted = await foldThread({ force: true, keepTokens: MANUAL_KEEP_TOKENS }).catch(
            () => false,
        );
        const latest = await compactionData.getLatest().catch(() => null);
        return c.json({ compacted, summary: latest?.summary ?? '' });
    });

    app.get('/v1/settings', async (c) => {
        const model = (await settings.getModel().catch(() => null)) ?? loadConfig().model;
        return c.json({ model });
    });

    app.post('/v1/settings', async (c) => {
        const body = (await c.req.json().catch(() => ({}))) as { model?: string };
        if (typeof body.model === 'string' && body.model.trim()) {
            const model = body.model.trim();
            await settings.setModel(model);
            return c.json({ model });
        }
        return c.json({ error: 'model (string) required' }, 400);
    });

    return app;
}
