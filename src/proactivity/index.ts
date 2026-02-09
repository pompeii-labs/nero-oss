import chalk from 'chalk';
import { isDbConnected } from '../db/index.js';
import { ThinkingRun, Note, type ThinkingRunData, type NoteData } from '../models/index.js';
import type { NeroConfig } from '../config.js';
import type { Nero } from '../agent/nero.js';

const IDLE_THRESHOLD_MS = 5 * 60 * 1000;
const RETENTION_DAYS = 7;

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
        if (this.config.proactivity.enabled) {
            console.log(chalk.dim('[proactivity] Starting idle timer on service start'));
            this.resetIdleTimer();
        }
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
        const intervalMs = this.config.proactivity.intervalMinutes * 60 * 1000;
        this.backgroundInterval = setInterval(() => {
            this.runBackgroundThinking();
        }, intervalMs);
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

        if (this.agent.isProcessing()) {
            console.log(chalk.dim('[proactivity] Skipping - Nero is currently processing'));
            return;
        }

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
        await ThinkingRun.create({ thought, surfaced: false });
    }

    private async cleanupOldThoughts(): Promise<void> {
        await ThinkingRun.deleteOlderThan(RETENTION_DAYS);
    }

    async getUnsurfacedThoughts(): Promise<ThinkingRunData[]> {
        return ThinkingRun.getUnsurfaced();
    }

    async markThoughtsSurfaced(ids: number[]): Promise<void> {
        await ThinkingRun.markSurfaced(ids);
    }

    async getRecentThoughts(limit = 10): Promise<ThinkingRunData[]> {
        return ThinkingRun.getRecent(limit);
    }

    async getUnsurfacedNotes(): Promise<NoteData[]> {
        return Note.getUnsurfaced();
    }

    async markNotesSurfaced(ids: number[]): Promise<void> {
        await Note.markSurfaced(ids);
    }

    async cleanupOldNotes(): Promise<void> {
        await Note.deleteOlderThan(RETENTION_DAYS);
    }

    shutdown(): void {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
        this.stopBackgroundLoop();
    }
}
