import { Hono } from 'hono';
import { Project } from '../models/project';
import { deliverApproval, deliverMergeApproval } from '../services/projects/approval';
import { scheduleReady } from '../services/projects/runner';
import { openPr } from '../services/projects/git';
import { getQueue } from '../lib/queue';
import { error } from '../util/errors';

/** The user acting on a project's plan-approval card: run it (with a budget), ask
 *  for changes, or cancel. Unblocks the waiting `plan_project` tool call. */
export function projectRoutes(): Hono {
    const app = new Hono();

    app.post('/v1/projects/:id/approve', async (c) => {
        try {
            const id = c.req.param('id');
            const b = (await c.req.json().catch(() => ({}))) as {
                action?: 'run' | 'tweak' | 'cancel';
                budgetUsd?: number;
                note?: string;
            };

            const p = await Project.get(id);
            if (!p) return error(c, 404);

            if (b.action === 'run') {
                const budgetUsd = Number(b.budgetUsd);
                if (!Number.isFinite(budgetUsd) || budgetUsd <= 0)
                    return error(c, 400, 'budget required');
                deliverApproval(id, { kind: 'run', budgetUsd });
            } else if (b.action === 'tweak') {
                deliverApproval(id, { kind: 'tweak', note: String(b.note ?? '').trim() });
            } else {
                deliverApproval(id, { kind: 'cancel' });
            }
            return c.json({ ok: true });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    app.post('/v1/projects/:id/pause', async (c) => {
        try {
            const p = await Project.get(c.req.param('id'));
            if (!p) return error(c, 404);
            if (p.status === 'running') await Project.update(p.id, { status: 'paused' });
            return c.json({ ok: true });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    app.post('/v1/projects/:id/resume', async (c) => {
        try {
            const p = await Project.get(c.req.param('id'));
            if (!p) return error(c, 404);
            if (p.status !== 'paused') return c.json({ ok: true });
            const b = (await c.req.json().catch(() => ({}))) as { budgetUsd?: number };
            const raise = Number(b.budgetUsd);
            await Project.update(p.id, {
                status: 'running',
                ...(Number.isFinite(raise) && raise > p.budget_usd ? { budget_usd: raise } : {}),
            });
            // The budget ceiling paused the queue; resume it or nothing gets picked up.
            await getQueue()
                .resume()
                .catch(() => {});
            await scheduleReady(p.id);
            return c.json({ ok: true });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    app.post('/v1/projects/:id/cancel', async (c) => {
        try {
            const p = await Project.get(c.req.param('id'));
            if (!p) return error(c, 404);
            if (p.status !== 'done' && p.status !== 'cancelled')
                await Project.update(p.id, { status: 'cancelled' });
            return c.json({ ok: true });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    // Hide a finished project from the Field dashboard, persisted so it stays gone
    // across reloads (dismissal used to be client-only session state).
    app.post('/v1/projects/:id/dismiss', async (c) => {
        try {
            const p = await Project.get(c.req.param('id'));
            if (!p) return error(c, 404);
            await Project.update(p.id, { dismissed: true });
            return c.json({ ok: true });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    // Resolve a blocked merge: the worker staged a conflict resolution and is waiting.
    app.post('/v1/projects/:id/merge-approve', async (c) => {
        try {
            const b = (await c.req.json().catch(() => ({}))) as { action?: 'approve' | 'reject' };
            const ok = deliverMergeApproval(
                c.req.param('id'),
                b.action === 'reject' ? 'reject' : 'approve',
            );
            return c.json({ ok });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    // Push the integration branch and open a PR (the only step that leaves the box).
    app.post('/v1/projects/:id/open-pr', async (c) => {
        try {
            const p = await Project.get(c.req.param('id'));
            if (!p) return error(c, 404);
            if (!p.repo_path || !p.integration_branch)
                return error(c, 400, 'project has no code branch');
            const url = await openPr(
                p.repo_path,
                p.integration_branch,
                p.base_branch ?? 'main',
                p.title,
                p.goal,
            );
            return c.json({ ok: true, url });
        } catch (err) {
            return error(c, 500, err);
        }
    });

    return app;
}
