import { Hono } from 'hono';
import { loadFile } from '../../files/store';

/** Serve attachment bytes from the local store (~/.nero/cache/files). */
export function fileRoutes(): Hono {
    const app = new Hono();

    app.get('/v1/files/:id', async (c) => {
        const file = await loadFile(c.req.param('id'));
        if (!file) return c.json({ error: 'not found' }, 404);
        return c.body(new Uint8Array(file.bytes), 200, {
            'Content-Type': file.mime,
            'Cache-Control': 'public, max-age=31536000, immutable',
        });
    });

    return app;
}
