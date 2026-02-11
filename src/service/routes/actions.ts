import { Router, Request, Response } from 'express';
import { Nero } from '../../agent/nero.js';
import { Logger } from '../../util/logger.js';
import { isDbConnected } from '../../db/index.js';
import { Action, ActionRun } from '../../models/index.js';
import { ActionManager } from '../../actions/index.js';

export function createActionsRouter(agent: Nero, actionManager: ActionManager) {
    const router = Router();
    const logger = new Logger('Actions');

    router.get('/actions', async (req: Request, res: Response) => {
        if (!isDbConnected()) {
            res.status(503).json({ error: 'Database not connected' });
            return;
        }

        try {
            const actions = await Action.getAll();
            res.json(actions);
        } catch (error) {
            logger.error(`Failed to list actions: ${(error as Error).message}`);
            res.status(500).json({ error: 'Failed to list actions' });
        }
    });

    router.post('/actions', async (req: Request, res: Response) => {
        if (!isDbConnected()) {
            res.status(503).json({ error: 'Database not connected' });
            return;
        }

        const { request, timestamp, steps, recurrence, enabled } = req.body;
        if (!request || !timestamp) {
            res.status(400).json({ error: 'request and timestamp are required' });
            return;
        }

        try {
            const action = await Action.create({
                request,
                timestamp: new Date(timestamp),
                recurrence: recurrence
                    ? typeof recurrence === 'string'
                        ? recurrence
                        : JSON.stringify(recurrence)
                    : null,
                steps: steps || [],
                enabled: enabled !== false,
                last_run: null,
            });
            res.json(action);
        } catch (error) {
            logger.error(`Failed to create action: ${(error as Error).message}`);
            res.status(500).json({ error: 'Failed to create action' });
        }
    });

    router.get('/actions/:id', async (req: Request, res: Response) => {
        if (!isDbConnected()) {
            res.status(503).json({ error: 'Database not connected' });
            return;
        }

        try {
            const id = parseInt(req.params.id as string, 10);
            const action = await Action.get(id);
            if (!action) {
                res.status(404).json({ error: 'Action not found' });
                return;
            }

            const runs = await ActionRun.getByAction(action.id, 10);
            res.json({ ...action, runs });
        } catch (error) {
            logger.error(`Failed to get action: ${(error as Error).message}`);
            res.status(500).json({ error: 'Failed to get action' });
        }
    });

    router.patch('/actions/:id', async (req: Request, res: Response) => {
        if (!isDbConnected()) {
            res.status(503).json({ error: 'Database not connected' });
            return;
        }

        try {
            const id = parseInt(req.params.id as string, 10);
            const action = await Action.get(id);
            if (!action) {
                res.status(404).json({ error: 'Action not found' });
                return;
            }

            const updates: Record<string, any> = {};
            if (req.body.request !== undefined) updates.request = req.body.request;
            if (req.body.timestamp !== undefined) updates.timestamp = new Date(req.body.timestamp);
            if (req.body.recurrence !== undefined) {
                updates.recurrence = req.body.recurrence
                    ? typeof req.body.recurrence === 'string'
                        ? req.body.recurrence
                        : JSON.stringify(req.body.recurrence)
                    : null;
            }
            if (req.body.steps !== undefined) updates.steps = req.body.steps;
            if (req.body.enabled !== undefined) updates.enabled = req.body.enabled;

            await action.update(updates);
            res.json(action);
        } catch (error) {
            logger.error(`Failed to update action: ${(error as Error).message}`);
            res.status(500).json({ error: 'Failed to update action' });
        }
    });

    router.delete('/actions/:id', async (req: Request, res: Response) => {
        if (!isDbConnected()) {
            res.status(503).json({ error: 'Database not connected' });
            return;
        }

        try {
            const id = parseInt(req.params.id as string, 10);
            const action = await Action.get(id);
            if (!action) {
                res.status(404).json({ error: 'Action not found' });
                return;
            }

            await action.delete();
            res.json({ success: true });
        } catch (error) {
            logger.error(`Failed to delete action: ${(error as Error).message}`);
            res.status(500).json({ error: 'Failed to delete action' });
        }
    });

    router.get('/actions/:id/runs', async (req: Request, res: Response) => {
        if (!isDbConnected()) {
            res.status(503).json({ error: 'Database not connected' });
            return;
        }

        try {
            const id = parseInt(req.params.id as string, 10);
            const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
            const runs = await ActionRun.getByAction(id, limit);
            res.json(runs);
        } catch (error) {
            logger.error(`Failed to get action runs: ${(error as Error).message}`);
            res.status(500).json({ error: 'Failed to get action runs' });
        }
    });

    router.post('/actions/:id/run', async (req: Request, res: Response) => {
        if (!isDbConnected()) {
            res.status(503).json({ error: 'Database not connected' });
            return;
        }

        try {
            const id = parseInt(req.params.id as string, 10);
            const action = await Action.get(id);
            if (!action) {
                res.status(404).json({ error: 'Action not found' });
                return;
            }

            const startTime = Date.now();
            const run = await ActionRun.create({
                action_id: action.id,
                status: 'running',
                result: null,
                error: null,
                started_at: new Date(),
                completed_at: null,
                duration_ms: null,
            });

            try {
                const result = await agent.runAction(action);
                const duration = Date.now() - startTime;

                await run.update({
                    status: 'success',
                    result: result?.slice(0, 5000) ?? null,
                    completed_at: new Date(),
                    duration_ms: duration,
                } as any);

                await action.update({ last_run: new Date() } as any);
                res.json(run);
            } catch (error) {
                const duration = Date.now() - startTime;
                await run.update({
                    status: 'error',
                    error: (error as Error).message.slice(0, 5000),
                    completed_at: new Date(),
                    duration_ms: duration,
                } as any);
                res.json(run);
            }
        } catch (error) {
            logger.error(`Failed to trigger action: ${(error as Error).message}`);
            res.status(500).json({ error: 'Failed to trigger action' });
        }
    });

    return router;
}
