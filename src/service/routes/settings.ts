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
        const body = (await c.req.json().catch(() => ({}))) as {
            model?: string;
            theme?: string;
            mode?: string;
        };
        let touched = false;
        if (typeof body.model === 'string' && body.model.trim()) {
            await settings.setModel(body.model.trim());
            touched = true;
        }
        // Field theme + day/night are shared across all of Nero's screens.
        if (typeof body.theme === 'string' && body.theme.trim()) {
            await settings.set('field_theme', body.theme.trim());
            touched = true;
        }
        if (typeof body.mode === 'string' && body.mode.trim()) {
            await settings.set('field_mode', body.mode.trim());
            touched = true;
        }
        if (!touched) return c.json({ error: 'nothing to set' }, 400);
        return c.json({ ok: true });
    });

    return app;
}
