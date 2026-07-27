import { Hono } from 'hono';
import { Actions } from '../services/actions';
import { catalogStatus, PROVIDERS } from '../services/actions/catalog';
import { ActionAuthor } from '../services/actions/author';
import { SLOTS, type ActionKind } from '../models/action';
import { error } from '../util/errors';

const KINDS: ActionKind[] = ['builtin', 'http', 'shell', 'prompt', 'agent'];

/** The dial. Eight slots around the orb, each bound to a builtin capability, a
 *  shell script, or a prompt. Nero writes these too (see services/actions/tool). */
export function actionRoutes(): Hono {
    const app = new Hono();

    app.get('/v1/actions', async (c) => {
        try {
            return c.json({ actions: await Actions.list(), slots: SLOTS });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    app.post('/v1/actions', async (c) => {
        try {
            const b = (await c.req.json().catch(() => ({}))) as {
                label?: string;
                icon?: string;
                kind?: string;
                body?: string;
                slot?: number;
                confirm?: boolean;
                cwd?: string;
            };
            const label = b.label?.trim();
            const kind = b.kind as ActionKind;
            if (!label) return error(c, 400, 'label is required');
            if (!KINDS.includes(kind))
                return error(c, 400, `kind must be one of ${KINDS.join(', ')}`);
            if (!b.body?.trim()) return error(c, 400, 'body is required');
            const slot = b.slot ?? -1;
            if (slot < -1 || slot >= SLOTS)
                return error(c, 400, `slot must be -1 or 0-${SLOTS - 1}`);

            return c.json(
                await Actions.create({
                    label,
                    kind,
                    body: b.body,
                    icon: b.icon,
                    slot,
                    confirm: b.confirm === true,
                    cwd: b.cwd?.trim() ?? '',
                }),
            );
        } catch (err) {
            return error(c, 500, err);
        }
    });

    app.patch('/v1/actions/:id', async (c) => {
        try {
            const b = (await c.req.json().catch(() => ({}))) as {
                label?: string;
                icon?: string;
                body?: string;
                slot?: number;
                confirm?: boolean;
                cwd?: string;
            };
            if (b.slot !== undefined && (b.slot < -1 || b.slot >= SLOTS))
                return error(c, 400, `slot must be -1 or 0-${SLOTS - 1}`);
            const updated = await Actions.update(c.req.param('id'), b);
            if (!updated) return error(c, 404);
            return c.json(updated);
        } catch (err) {
            return error(c, 500, err);
        }
    });

    app.delete('/v1/actions/:id', async (c) => {
        try {
            await Actions.remove(c.req.param('id'));
            return c.json({ ok: true });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    app.get('/v1/actions/catalog', async (c) => {
        try {
            return c.json({ templates: await catalogStatus(), providers: PROVIDERS });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    app.post('/v1/actions/from-template', async (c) => {
        try {
            const b = (await c.req.json().catch(() => ({}))) as {
                template?: string;
                slot?: number;
                label?: string;
                params?: Record<string, string>;
            };
            if (!b.template) return error(c, 400, 'template is required');
            const slot = b.slot ?? -1;
            if (slot < -1 || slot >= SLOTS)
                return error(c, 400, `slot must be -1 or 0-${SLOTS - 1}`);

            const r = await Actions.fromTemplate(b.template, {
                slot,
                label: b.label,
                params: b.params,
            });
            if (r.error) return error(c, 400, r.error);
            return c.json({ action: r.action, missingSecrets: r.missingSecrets });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    /** Hand a slot to Nero: he drafts an action, runs it until it works, and binds it.
     *  Returns as soon as the row exists so the dial can render it building. */
    app.post('/v1/actions/author', async (c) => {
        try {
            const b = (await c.req.json().catch(() => ({}))) as {
                goal?: string;
                slot?: number;
                /** Block until it's authored. For scripted tests; the UI fires and forgets. */
                wait?: boolean;
            };
            const goal = b.goal?.trim();
            if (!goal) return error(c, 400, 'goal is required');
            const slot = b.slot ?? -1;
            if (slot < -1 || slot >= SLOTS)
                return error(c, 400, `slot must be -1 or 0-${SLOTS - 1}`);

            if (b.wait === true) return c.json(await ActionAuthor.author(goal, slot));
            void ActionAuthor.author(goal, slot).catch(() => {});
            return c.json({ started: true, slot });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    /** Revise an action in place: same row, same slot, Nero changes what it does. */
    app.post('/v1/actions/:id/revise', async (c) => {
        try {
            const b = (await c.req.json().catch(() => ({}))) as { goal?: string; wait?: boolean };
            const goal = b.goal?.trim();
            if (!goal) return error(c, 400, 'goal is required');
            const id = c.req.param('id');
            const existing = await Actions.get(id);
            if (!existing) return error(c, 404);

            if (b.wait === true) return c.json(await ActionAuthor.author(goal, existing.slot, id));
            void ActionAuthor.author(goal, existing.slot, id).catch(() => {});
            return c.json({ started: true, id });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    app.post('/v1/actions/:id/run', async (c) => {
        try {
            const result = await Actions.run(c.req.param('id'));
            return c.json(result);
        } catch (err) {
            return error(c, 500, err);
        }
    });

    return app;
}
