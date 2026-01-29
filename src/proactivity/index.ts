import chalk from 'chalk';
import { db, isDbConnected } from '../db/index.js';
import type { NeroConfig } from '../config.js';
import type { Nero } from '../agent/nero.js';

const IDLE_THRESHOLD_MS = 5 * 60 * 1000;
const BACKGROUND_INTERVAL_MS = 10 * 60 * 1000;
const RETENTION_DAYS = 7;

interface ThinkingRun {
    id: number;
    thought: string;
    surfaced: boolean;
    created_at: string;
}

export interface Note {
    id: number;
    content: string;
    category: string | null;
    created_at: string;
}

export class ProactivityManager {
    private config: NeroConfig;
    private agent: Nero | null = null;
    private idleTimer: NodeJS.Timeout | null = null;
    private backgroundInterval: NodeJS.Timeout | null = null;
    private isRunning: boolean = false;

    constructor(config: NeroConfig) {
        this.config = config;
    }

    setAgent(agent: Nero): void {
        this.agent = agent;
    }

    onUserActivity(): void {
        if (!this.config.proactivity.enabled) return;

        this.stopBackgroundLoop();
        this.resetIdleTimer();
    }

    private resetIdleTimer(): void {
        if (this.idleTimer) clearTimeout(this.idleTimer);

        this.idleTimer = setTimeout(() => {
            this.startBackgroundLoop();
        }, IDLE_THRESHOLD_MS);
    }

    private startBackgroundLoop(): void {
        if (this.backgroundInterval || !this.config.proactivity.enabled) return;

        console.log(chalk.dim('[proactivity] User idle, starting background loop'));

        this.runBackgroundThinking();
        this.backgroundInterval = setInterval(() => {
            this.runBackgroundThinking();
        }, BACKGROUND_INTERVAL_MS);
    }

    private stopBackgroundLoop(): void {
        if (this.backgroundInterval) {
            clearInterval(this.backgroundInterval);
            this.backgroundInterval = null;
            console.log(chalk.dim('[proactivity] User active, pausing background loop'));
        }
    }

    private async runBackgroundThinking(): Promise<void> {
        if (this.isRunning || !isDbConnected() || !this.agent) return;

        this.isRunning = true;
        console.log(chalk.dim('[proactivity] Running background thinking...'));

        try {
            const recentThoughts = await this.getRecentThoughts(20);
            const thought = await this.agent.runBackgroundThinking(recentThoughts);

            if (thought && thought.trim()) {
                const isUrgent = thought.startsWith('[URGENT]');
                const cleanThought = isUrgent ? thought.replace('[URGENT]', '').trim() : thought;

                await this.storeThought(cleanThought);
                console.log(
                    chalk.dim(`[proactivity] Stored thought: ${cleanThought.slice(0, 50)}...`),
                );

                if (isUrgent && this.config.proactivity.notify) {
                    await this.sendNotification(cleanThought);
                }
            }

            await this.cleanupOldThoughts();
        } catch (error) {
            console.error(chalk.dim(`[proactivity] Error: ${(error as Error).message}`));
        } finally {
            this.isRunning = false;
        }
    }

    private async sendNotification(thought: string): Promise<void> {
        if (!this.config.licenseKey) return;

        try {
            const apiUrl = process.env.BACKEND_URL || 'https://api.magmadeploy.com';

            await fetch(`${apiUrl}/v1/nero/send-slack`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-license-key': this.config.licenseKey,
                },
                body: JSON.stringify({ text: `[Background] ${thought}` }),
            });

            console.log(chalk.dim('[proactivity] Sent notification'));
        } catch (error) {
            console.error(
                chalk.dim(`[proactivity] Notification failed: ${(error as Error).message}`),
            );
        }
    }

    private async storeThought(thought: string): Promise<void> {
        await db.query('INSERT INTO thinking_runs (thought) VALUES ($1)', [thought]);
    }

    private async cleanupOldThoughts(): Promise<void> {
        await db.query(
            `DELETE FROM thinking_runs WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'`,
        );
    }

    async getUnsurfacedThoughts(): Promise<ThinkingRun[]> {
        if (!isDbConnected()) return [];

        const result = await db.query(
            `SELECT id, thought, surfaced, created_at FROM thinking_runs
             WHERE surfaced = FALSE
             ORDER BY created_at ASC`,
        );

        return result.rows;
    }

    async markThoughtsSurfaced(ids: number[]): Promise<void> {
        if (!isDbConnected() || ids.length === 0) return;

        await db.query('UPDATE thinking_runs SET surfaced = TRUE WHERE id = ANY($1)', [ids]);
    }

    async getRecentThoughts(limit = 10): Promise<ThinkingRun[]> {
        if (!isDbConnected()) return [];

        const result = await db.query(
            `SELECT id, thought, surfaced, created_at FROM thinking_runs
             ORDER BY created_at DESC LIMIT $1`,
            [limit],
        );

        return result.rows;
    }

    async getUnsurfacedNotes(): Promise<Note[]> {
        if (!isDbConnected()) return [];

        const result = await db.query(
            `SELECT id, content, category, created_at FROM notes
             WHERE surfaced = FALSE
             ORDER BY created_at ASC`,
        );

        return result.rows;
    }

    async markNotesSurfaced(ids: number[]): Promise<void> {
        if (!isDbConnected() || ids.length === 0) return;

        await db.query('UPDATE notes SET surfaced = TRUE WHERE id = ANY($1)', [ids]);
    }

    async cleanupOldNotes(): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(
            `DELETE FROM notes WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'`,
        );
    }

    shutdown(): void {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
        this.stopBackgroundLoop();
    }
}
