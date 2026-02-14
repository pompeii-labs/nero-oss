import chalk from 'chalk';
import { randomUUID } from 'crypto';
import { isDbConnected } from '../db/index.js';
import { AutonomyJournal, AutonomyProject } from '../models/index.js';
import type { NeroConfig } from '../config.js';
import type { Nero } from '../agent/nero.js';

const INITIAL_DELAY_MS = 2 * 60 * 1000;
const RETRY_DELAY_MS = 10 * 60 * 1000;
const BUSY_RETRY_MS = 2 * 60 * 1000;
const RETENTION_DAYS = 30;

export class AutonomyManager {
    private config: NeroConfig;
    private agent: Nero | null = null;
    private wakeTimer: ReturnType<typeof setTimeout> | null = null;
    private isRunning: boolean = false;
    private currentSessionId: string | null = null;
    private sessionAborted: boolean = false;

    constructor(config: NeroConfig) {
        this.config = config;
    }

    setAgent(agent: Nero): void {
        this.agent = agent;

        if (!this.config.autonomy?.enabled) return;

        if (!isDbConnected()) {
            console.log(chalk.dim('[autonomy] Disabled (no database connection)'));
            return;
        }

        console.log(chalk.dim('[autonomy] Scheduling first session in 2 minutes'));
        this.scheduleWake(INITIAL_DELAY_MS);
    }

    shutdown(): void {
        if (this.wakeTimer) {
            clearTimeout(this.wakeTimer);
            this.wakeTimer = null;
        }
        this.sessionAborted = true;
    }

    abortSession(): void {
        this.sessionAborted = true;
    }

    isActive(): boolean {
        return this.isRunning;
    }

    getCurrentSessionId(): string | null {
        return this.currentSessionId;
    }

    private scheduleWake(delayMs: number): void {
        if (this.wakeTimer) clearTimeout(this.wakeTimer);

        const minutes = Math.round(delayMs / 60000);
        console.log(chalk.dim(`[autonomy] Next session in ${minutes} minutes`));

        this.wakeTimer = setTimeout(() => {
            this.runSession().catch((err) => {
                console.error(chalk.dim(`[autonomy] Session error: ${err.message}`));
                this.scheduleWake(RETRY_DELAY_MS);
            });
        }, delayMs);
    }

    private async runSession(): Promise<void> {
        if (this.isRunning) return;
        if (!this.agent) return;
        if (!isDbConnected()) {
            console.log(chalk.dim('[autonomy] Skipping - no database connection'));
            this.scheduleWake(RETRY_DELAY_MS);
            return;
        }

        if (this.agent.isProcessing()) {
            console.log(chalk.dim('[autonomy] Agent busy, retrying in 2 minutes'));
            this.scheduleWake(BUSY_RETRY_MS);
            return;
        }

        const tokensToday = await AutonomyJournal.getTokensToday();
        const budget = this.config.autonomy.dailyTokenBudget;
        if (budget > 0 && tokensToday >= budget) {
            console.log(
                chalk.dim(`[autonomy] Daily token budget exhausted (${tokensToday}/${budget})`),
            );
            const msUntilMidnight = this.msUntilMidnight();
            this.scheduleWake(msUntilMidnight);
            return;
        }

        const sessionsToday = await AutonomyJournal.getSessionsToday();
        const maxSessions = this.config.autonomy.maxSessionsPerDay;
        if (maxSessions > 0 && sessionsToday >= maxSessions) {
            console.log(
                chalk.dim(
                    `[autonomy] Max sessions reached for today (${sessionsToday}/${maxSessions})`,
                ),
            );
            const msUntilMidnight = this.msUntilMidnight();
            this.scheduleWake(msUntilMidnight);
            return;
        }

        this.isRunning = true;
        this.sessionAborted = false;
        const sessionId = randomUUID();
        this.currentSessionId = sessionId;

        console.log(chalk.dim(`[autonomy] Starting session ${sessionId.slice(0, 8)}`));

        try {
            const startTime = Date.now();
            const result = await this.agent.runAutonomousSession(sessionId, {
                maxMinutes: this.config.autonomy.maxSessionMinutes,
                minSleep: this.config.autonomy.minSleepMinutes,
                maxSleep: this.config.autonomy.maxSleepMinutes,
                budgetRemaining: budget > 0 ? budget - tokensToday : -1,
                destructive: this.config.autonomy.destructive,
                protectedBranches: this.config.autonomy.protectedBranches,
            });

            const durationMs = Date.now() - startTime;
            const totalTokens = result.inputTokens + result.outputTokens;
            console.log(
                chalk.dim(
                    `[autonomy] Session completed in ${Math.round(durationMs / 1000)}s (${result.inputTokens} in / ${result.outputTokens} out)`,
                ),
            );

            await AutonomyJournal.updateSessionMetrics(sessionId, totalTokens, durationMs);

            const activeProjects = await AutonomyProject.getActive();
            for (const project of activeProjects) {
                await project.incrementSessions();
            }

            await AutonomyJournal.deleteOlderThan(RETENTION_DAYS);

            const sleepMs = this.calculateSleepDuration(result.requestedSleepMinutes);
            this.scheduleWake(sleepMs);
        } catch (error) {
            console.error(chalk.dim(`[autonomy] Session error: ${(error as Error).message}`));
            this.scheduleWake(RETRY_DELAY_MS);
        } finally {
            this.isRunning = false;
            this.currentSessionId = null;
        }
    }

    private calculateSleepDuration(requestedMinutes: number): number {
        const min = this.config.autonomy.minSleepMinutes;
        const max = this.config.autonomy.maxSleepMinutes;
        const clamped = Math.max(min, Math.min(max, requestedMinutes));
        return clamped * 60 * 1000;
    }

    private msUntilMidnight(): number {
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        return midnight.getTime() - now.getTime();
    }
}
