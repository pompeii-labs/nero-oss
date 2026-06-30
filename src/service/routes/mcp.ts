import { Hono } from 'hono';
import { McpConnect } from '../../mcp/connect';
import { getMcpClient } from '../../mcp/client';
import { McpConnection } from '../../models/mcp-connection';

function page(title: string, msg: string, ok: boolean): string {
    return `<!doctype html><html><head><meta charset="utf-8"><title>Nero</title></head><body style="font-family:system-ui,sans-serif;background:#080a0d;color:#e0e5ed;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center;max-width:32rem;padding:2rem"><h2 style="color:${ok ? '#33ccff' : '#ff8080'}">${title}</h2><p>${msg}</p><p style="opacity:.5;font-size:.9rem">You can close this tab and head back to Nero.</p></div></body></html>`;
}

/** MCP OAuth callback + integration management for the web. */
export function mcpRoutes(): Hono {
    const app = new Hono();

    // The auth server redirects here after the user approves.
    app.get('/v1/mcp/callback', async (c) => {
        const code = c.req.query('code');
        const state = c.req.query('state');
        const error = c.req.query('error');
        if (error) return c.html(page('Authorization failed', error, false));
        if (!code || !state)
            return c.html(page('Missing parameters', 'No code/state in the callback.', false));
        const r = await McpConnect.complete(state, code);
        return c.html(page(r.ok ? 'Connected' : 'Almost there', r.message, r.ok));
    });

    // Sanitized list for the web (never returns tokens).
    app.get('/v1/mcp/list', async (c) => {
        const conns = await McpConnection.listAll();
        const client = getMcpClient();
        return c.json({
            integrations: conns.map((co) => ({
                name: co.name,
                url: co.url,
                transport: co.transport,
                connected: client.isConnected(co.name),
                hasAuth: Boolean(co.auth?.apiKey || co.auth?.oauth?.tokens),
                tools: client
                    .getTools()
                    .filter((t) => t.server === co.name)
                    .map((t) => t.name),
            })),
        });
    });

    app.post('/v1/mcp/reconnect', async (c) => {
        const body = (await c.req.json().catch(() => ({}))) as { name?: string };
        if (!body.name) return c.json({ error: 'name required' }, 400);
        return c.json(await McpConnect.reconnect(body.name));
    });

    // Begin a connection. OAuth servers return { status:'auth_required', authUrl }
    // which the UI opens; API-key / open servers connect immediately.
    app.post('/v1/mcp/connect', async (c) => {
        const body = (await c.req.json().catch(() => ({}))) as {
            name?: string;
            url?: string;
            apiKey?: string;
        };
        if (!body.name || !body.url) return c.json({ error: 'name and url required' }, 400);
        const r = await McpConnect.start({ name: body.name, url: body.url, apiKey: body.apiKey });
        return c.json(r);
    });

    app.post('/v1/mcp/disconnect', async (c) => {
        const body = (await c.req.json().catch(() => ({}))) as { name?: string };
        if (!body.name) return c.json({ error: 'name required' }, 400);
        return c.json({ message: await McpConnect.disconnect(body.name) });
    });

    return app;
}
