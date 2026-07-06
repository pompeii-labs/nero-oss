import { Hono } from 'hono';
import { loadConfig } from '@nero/shared/config';
import { Settings } from '../models/settings';
import { foldThread, MANUAL_KEEP_TOKENS } from '../services/harness/compaction';
import { Compaction } from '../models/compaction';
import { error } from '../util/errors';

/** Runtime settings (single-user). GET resolves the effective values; POST sets. */
export function settingsRoutes(): Hono {
    const app = new Hono();

    // Manual compaction: force-fold the thread now, keeping an absolute recent tail
    // (a window-fraction would dwarf the session on 1M-window models). Summarizes
    // everything older. Returns the resulting summary.
    app.post('/v1/compact', async (c) => {
        try {
            const compacted = await foldThread({
                force: true,
                keepTokens: MANUAL_KEEP_TOKENS,
            }).catch(() => false);
            const latest = await Compaction.getLatest().catch(() => null);
            return c.json({ compacted, summary: latest?.summary ?? '' });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    app.get('/v1/settings', async (c) => {
        try {
            const model = (await Settings.getModel().catch(() => null)) ?? loadConfig().model;
            return c.json({ model });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    app.post('/v1/settings', async (c) => {
        try {
            const body = (await c.req.json().catch(() => ({}))) as {
                model?: string;
                theme?: string;
                mode?: string;
            };
            let touched = false;
            if (typeof body.model === 'string' && body.model.trim()) {
                await Settings.setModel(body.model.trim());
                touched = true;
            }
            // Field theme + day/night are shared across all of Nero's screens.
            if (typeof body.theme === 'string' && body.theme.trim()) {
                await Settings.set('field_theme', body.theme.trim());
                touched = true;
            }
            if (typeof body.mode === 'string' && body.mode.trim()) {
                await Settings.set('field_mode', body.mode.trim());
                touched = true;
            }
            if (!touched) return error(c, 400, 'nothing to set');
            return c.json({ ok: true });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    return app;
}
