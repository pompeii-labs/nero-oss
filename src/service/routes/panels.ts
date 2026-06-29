import { Hono } from 'hono';
import * as panels from '../../data/panels';
import { runPanelFunction } from '../../panels/exec';
import { startDispatch } from '../../harness/dispatch';

/** Panel control plane: the user dismissing, dragging/resizing, or interacting
 *  with a panel. Geometry writes persist (so it survives reload AND Nero sees the
 *  new position); interactions reach Nero as labeled events, not chat messages. */
export function panelRoutes(): Hono {
    const app = new Hono();

    app.post('/v1/panels/:id/close', async (c) => {
        const id = c.req.param('id');
        if (await panels.get(id)) await panels.close(id);
        return c.json({ ok: true });
    });

    app.post('/v1/panels/:id/geometry', async (c) => {
        const id = c.req.param('id');
        const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
        const patch: panels.PanelPatch = {};
        for (const k of ['x', 'y', 'w', 'h'] as const) {
            if (typeof b[k] === 'number') patch[k] = Math.round(b[k] as number);
        }
        if (Object.keys(patch).length && (await panels.get(id))) await panels.update(id, patch);
        return c.json({ ok: true });
    });

    app.post('/v1/panels/:id/maximize', async (c) => {
        const id = c.req.param('id');
        const b = (await c.req.json().catch(() => ({}))) as { on?: boolean };
        if (await panels.get(id)) await panels.update(id, { maximized: b.on !== false });
        return c.json({ ok: true });
    });

    // A `call` button: run the panel's named server-side function and merge its
    // output into the panel state (so bound components update). No LLM turn.
    app.post('/v1/panels/:id/call', async (c) => {
        const id = c.req.param('id');
        const b = (await c.req.json().catch(() => ({}))) as { fn?: string };
        const p = await panels.get(id);
        if (!p) return c.json({ error: 'no such panel' }, 404);
        const fn = b.fn ? p.functions[b.fn] : undefined;
        if (!fn) return c.json({ error: `no function "${b.fn}"` }, 400);
        let patch: Record<string, unknown>;
        try {
            patch = await runPanelFunction(fn);
        } catch (e) {
            patch = { error: e instanceof Error ? e.message : String(e) };
        }
        await panels.update(id, { state: { ...p.state, ...patch } });
        return c.json({ ok: true });
    });

    app.post('/v1/panels/:id/interact', async (c) => {
        const id = c.req.param('id');
        const b = (await c.req.json().catch(() => ({}))) as {
            control?: string;
            intent?: string;
            value?: unknown;
        };
        const p = await panels.get(id);
        if (!p) return c.json({ error: 'no such panel' }, 404);
        const control = String(b.control ?? 'a control');
        const value = b.value != null ? ` Value: ${JSON.stringify(b.value)}.` : '';
        const intent = b.intent ? ` (You set this up meaning: ${b.intent}.)` : '';
        const text = `[interaction] On your panel "${p.title}", the user pressed "${control}".${value}${intent}`;
        const res = await startDispatch({ text, interaction: true });
        return c.json({ dispatchId: res.dispatchId, steered: res.steered });
    });

    return app;
}
