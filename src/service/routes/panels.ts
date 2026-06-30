import { Hono } from 'hono';
import { Panel, type PanelData } from '../../models/panel';
import { runPanelFunction } from '../../panels/exec';
import { Dispatcher } from '../../harness/dispatch';
import { error } from '../../util/errors';

/** Panel control plane: the user dismissing, dragging/resizing, or interacting
 *  with a panel. Geometry writes persist (so it survives reload AND Nero sees the
 *  new position); interactions reach Nero as labeled events, not chat messages. */
export function panelRoutes(): Hono {
    const app = new Hono();

    app.post('/v1/panels/:id/close', async (c) => {
        try {
            const id = c.req.param('id');
            if (await Panel.get(id)) await Panel.close(id);
            return c.json({ ok: true });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    app.post('/v1/panels/:id/geometry', async (c) => {
        try {
            const id = c.req.param('id');
            const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
            const patch: Partial<PanelData> = {};
            for (const k of ['x', 'y', 'w', 'h'] as const) {
                if (typeof b[k] === 'number') patch[k] = Math.round(b[k] as number);
            }
            if (Object.keys(patch).length && (await Panel.get(id))) await Panel.update(id, patch);
            return c.json({ ok: true });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    app.post('/v1/panels/:id/maximize', async (c) => {
        try {
            const id = c.req.param('id');
            const b = (await c.req.json().catch(() => ({}))) as { on?: boolean };
            if (await Panel.get(id)) await Panel.update(id, { maximized: b.on !== false });
            return c.json({ ok: true });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    // A `call` button: run the panel's named server-side function and merge its
    // output into the panel state (so bound components update). No LLM turn.
    app.post('/v1/panels/:id/call', async (c) => {
        try {
            const id = c.req.param('id');
            const b = (await c.req.json().catch(() => ({}))) as { fn?: string };
            const p = await Panel.get(id);
            if (!p) return error(c, 404, 'no such panel');
            const fn = b.fn ? p.functions[b.fn] : undefined;
            if (!fn) return error(c, 400, `no function "${b.fn}"`);
            let patch: Record<string, unknown>;
            try {
                patch = await runPanelFunction(fn);
            } catch (e) {
                patch = { error: e instanceof Error ? e.message : String(e) };
            }
            await Panel.update(id, { state: { ...p.state, ...patch } });
            return c.json({ ok: true });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    app.post('/v1/panels/:id/interact', async (c) => {
        try {
            const id = c.req.param('id');
            const b = (await c.req.json().catch(() => ({}))) as {
                control?: string;
                intent?: string;
                value?: unknown;
            };
            const p = await Panel.get(id);
            if (!p) return error(c, 404, 'no such panel');
            const control = String(b.control ?? 'a control');
            const value = b.value != null ? ` Value: ${JSON.stringify(b.value)}.` : '';
            const intent = b.intent ? ` (You set this up meaning: ${b.intent}.)` : '';
            const text = `[interaction] On your panel "${p.title}", the user pressed "${control}".${value}${intent}`;
            const res = await Dispatcher.start({ text, interaction: true });
            return c.json({ dispatchId: res.dispatchId, steered: res.steered });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    return app;
}
