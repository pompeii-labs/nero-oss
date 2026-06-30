import { Hono } from 'hono';
import { Question } from '../../models/question';
import { deliverAnswer } from '../../ask/pending';

/** The user answering (or dismissing) a question Nero is blocked on. Persists the
 *  outcome for the live UI and unblocks the waiting `ask` tool call. */
export function askRoutes(): Hono {
    const app = new Hono();

    app.post('/v1/ask/:id/answer', async (c) => {
        const id = c.req.param('id');
        const b = (await c.req.json().catch(() => ({}))) as {
            answers?: string[][];
            dismiss?: boolean;
        };
        const answers = Array.isArray(b.answers)
            ? b.answers.map((a) => (Array.isArray(a) ? a.map(String) : []))
            : [];
        const dismissed = b.dismiss === true || answers.length === 0;

        if (await Question.get(id)) {
            await Question.resolve(
                id,
                dismissed ? 'cancelled' : 'answered',
                dismissed ? null : answers,
            );
        }
        deliverAnswer(id, dismissed ? { kind: 'cancelled' } : { kind: 'answered', answers });
        return c.json({ ok: true });
    });

    return app;
}
