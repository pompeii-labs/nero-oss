import { Hono } from 'hono';
import {
    Settings,
    MODEL_KEY,
    VOICE_MODEL_KEY,
    PLAN_MODEL_KEY,
    SUBAGENT_MODEL_KEY,
} from '../models/settings';
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

    // The four model roles (base / voice / planning / subagents), each resolved to
    // its `settings` value or DEFAULT_MODEL.
    app.get('/v1/settings', async (c) => {
        try {
            return c.json(await Settings.resolveAllModels());
        } catch (err) {
            return error(c, 500, err);
        }
    });

    app.post('/v1/settings', async (c) => {
        try {
            const body = (await c.req.json().catch(() => ({}))) as {
                model?: string;
                voiceModel?: string;
                planModel?: string;
                subagentModel?: string;
                theme?: string;
                mode?: string;
            };
            let touched = false;
            const setIf = async (val: unknown, key: string) => {
                if (typeof val === 'string' && val.trim()) {
                    await Settings.set(key, val.trim());
                    touched = true;
                }
            };
            await setIf(body.model, MODEL_KEY);
            await setIf(body.voiceModel, VOICE_MODEL_KEY);
            await setIf(body.planModel, PLAN_MODEL_KEY);
            await setIf(body.subagentModel, SUBAGENT_MODEL_KEY);
            // Field theme + day/night are shared across all of Nero's screens.
            await setIf(body.theme, 'field_theme');
            await setIf(body.mode, 'field_mode');
            if (!touched) return error(c, 400, 'nothing to set');
            return c.json({ ok: true });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    return app;
}
