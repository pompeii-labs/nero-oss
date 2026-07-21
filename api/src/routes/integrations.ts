import { Hono } from 'hono';
import { CATALOG, missingSecrets } from '../mcp/catalog';
import { integrationStatus } from '../mcp/reconcile';
import { startAuth, complete } from '../mcp/oauth';
import { McpConnection } from '../models/mcp-connection';
import { getMcpClient } from '../services/mcp/client';
import { error } from '../util/errors';

/** Built-in integrations: status, begin-auth, and the OAuth callback (api-owned). */
export function integrationRoutes(): Hono {
    const app = new Hono();

    app.get('/v1/integrations', async (c) => {
        try {
            const integrations = await Promise.all(
                CATALOG.map(async (i) => ({
                    id: i.id,
                    name: i.name,
                    description: i.description,
                    status: await integrationStatus(i),
                    missingSecrets: await missingSecrets(i),
                })),
            );
            return c.json({ integrations });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    // Begin authorizing -> returns a consent URL to hand the user.
    app.post('/v1/integrations/:id/authorize', async (c) => {
        try {
            return c.json(await startAuth(c.req.param('id')));
        } catch (err) {
            return error(c, 500, err);
        }
    });

    // OAuth redirect target: exchange the code, store tokens, reconnect the server.
    app.get('/v1/integrations/callback', async (c) => {
        const authErr = c.req.query('error');
        if (authErr) return c.html(page(`Authorization was declined (${authErr}).`));
        const r = await complete(c.req.query('state') ?? '', c.req.query('code') ?? '');
        if (r.ok && r.id) {
            const conn = await McpConnection.getByName(r.id);
            if (conn)
                await getMcpClient()
                    .connectOne(conn)
                    .catch(() => {});
        }
        return c.html(page(r.message));
    });

    return app;
}

function page(msg: string): string {
    return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:-apple-system,system-ui,sans-serif;background:#0a0e14;color:#cfe;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center;padding:2rem"><div style="font-size:2rem">◉</div><p>${msg}</p><p style="opacity:.6">You can close this tab.</p></div></body>`;
}
