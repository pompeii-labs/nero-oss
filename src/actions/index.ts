import chalk from 'chalk';
import { isDbConnected } from '../db/index.js';
import { Action, ActionRun } from '../models/index.js';
import type { Nero } from '../agent/nero.js';

const RETENTION_DAYS = 30;

export class ActionManager {
    private agent: Nero | null = null;
    private checkInterval: NodeJS.Timeout | null = null;
    private runningActions: Set<number> = new Set();
    private isExecuting: boolean = false;

    setAgent(agent: Nero): void {
        this.agent = agent;
    }

    start(): void {
        if (this.checkInterval) return;

        this.checkInterval = setInterval(() => {
            this.checkAndRun();
        }, 60_000);

        this.checkAndRun();
    }

    shutdown(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    private async checkAndRun(): Promise<void> {
        if (!isDbConnected() || !this.agent) return;
        if (this.isExecuting) return;

        if (this.agent.isProcessing()) {
            console.log(chalk.dim('[actions] Skipping check - Nero is currently processing'));
            return;
        }

        try {
            const dueActions = await Action.getDue();

            for (const action of dueActions) {
                if (this.runningActions.has(action.id)) continue;

                if (this.agent.isProcessing()) {
                    console.log(chalk.dim('[actions] Pausing queue - Nero started processing'));
                    break;
                }

                await this.executeAction(action);
            }

            await ActionRun.deleteOlderThan(RETENTION_DAYS);
        } catch (error) {
            console.error(chalk.dim(`[actions] Check error: ${(error as Error).message}`));
        }
    }

    private async executeAction(action: Action): Promise<void> {
        this.runningActions.add(action.id);
        this.isExecuting = true;
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

        console.log(
            chalk.dim(`[actions] Executing action #${action.id}: ${action.request.slice(0, 60)}`),
        );

        try {
            const result = await this.agent!.runAction(action);
            const duration = Date.now() - startTime;

            await run.update({
                status: 'success',
                result: result?.slice(0, 5000) ?? null,
                completed_at: new Date(),
                duration_ms: duration,
            } as any);

            await action.update({ last_run: new Date() } as any);

            const rescheduled = await action.reschedule();
            if (!rescheduled) {
                await action.delete();
                console.log(
                    chalk.dim(`[actions] One-time action #${action.id} completed and removed`),
                );
            } else {
                console.log(
                    chalk.dim(
                        `[actions] Recurring action #${action.id} rescheduled to ${action.timestamp}`,
                    ),
                );
            }
        } catch (error) {
            const duration = Date.now() - startTime;
            const errMsg = (error as Error).message;

            await run.update({
                status: 'error',
                error: errMsg.slice(0, 5000),
                completed_at: new Date(),
                duration_ms: duration,
            } as any);

            console.error(chalk.dim(`[actions] Action #${action.id} failed: ${errMsg}`));

            const rescheduled = await action.reschedule();
            if (!rescheduled) {
                await action.delete();
            }
        } finally {
            this.runningActions.delete(action.id);
            this.isExecuting = false;
        }
    }
}
