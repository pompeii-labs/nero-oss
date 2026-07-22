import { Hono } from 'hono';
import { ModelRegistry } from '../models/model-registry';
import { error } from '../util/errors';

/** The model registry: named endpoints (local servers, custom providers) that roles
 *  can select by id. A role value that isn't a registry id is a raw OpenRouter slug. */
export function modelRoutes(): Hono {
    const app = new Hono();

    app.get('/v1/models', async (c) => {
        try {
            return c.json({ models: await ModelRegistry.list() });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    app.post('/v1/models', async (c) => {
        try {
            const b = (await c.req.json().catch(() => ({}))) as {
                id?: string;
                label?: string;
                base_url?: string;
                model?: string;
                api_key_secret?: string | null;
                reasoning?: boolean;
            };
            const id = (b.id ?? '').trim().toLowerCase();
            if (!id || !b.base_url?.trim() || !b.model?.trim())
                return error(c, 400, 'id, base_url, and model are required');
            const entry = await ModelRegistry.upsert({
                id,
                label: b.label?.trim() || id,
                base_url: b.base_url.trim(),
                model: b.model.trim(),
                api_key_secret: b.api_key_secret?.trim() || null,
                reasoning: b.reasoning === true,
            });
            return c.json(entry);
        } catch (err) {
            return error(c, 500, err);
        }
    });

    app.delete('/v1/models/:id', async (c) => {
        try {
            await ModelRegistry.remove(c.req.param('id'));
            return c.json({ ok: true });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    return app;
}
