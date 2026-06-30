import { Hono } from 'hono';
import { loadFile } from '../../files/store';
import { error } from '../../util/errors';

/** Serve attachment bytes from the local store (~/.nero/cache/files). */
export function fileRoutes(): Hono {
    const app = new Hono();

    app.get('/v1/files/:id', async (c) => {
        try {
            const file = await loadFile(c.req.param('id'));
            if (!file) return error(c, 404);
            return c.body(new Uint8Array(file.bytes), 200, {
                'Content-Type': file.mime,
                'Cache-Control': 'public, max-age=31536000, immutable',
            });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    return app;
}
