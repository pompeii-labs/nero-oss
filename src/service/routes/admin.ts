import { Router, Request, Response } from 'express';
import { readFile, writeFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { Logger } from '../../util/logger.js';
import { getConfigDir } from '../../config.js';

const logger = new Logger('Admin');

const ENV_KEYS = [
    'OPENROUTER_API_KEY',
    'DATABASE_URL',
    'NERO_LICENSE_KEY',
    'ELEVENLABS_API_KEY',
    'DEEPGRAM_API_KEY',
    'TAVILY_API_KEY',
];

function getEnvPath(): string {
    return join(getConfigDir(), '.env');
}

function isIntegratedMode(): boolean {
    if (process.env.NERO_MODE === 'contained') return false;
    if (process.env.NERO_MODE === 'integrated') return true;
    return !!process.env.HOST_HOME;
}

function canReadEnv(): boolean {
    if (process.env.NERO_MODE === 'contained') return true;
    if (process.env.NERO_MODE === 'integrated') return true;
    return !!process.env.HOST_HOME;
}

function canManageEnv(): boolean {
    if (process.env.NERO_MODE === 'contained') return false;
    if (process.env.NERO_MODE === 'integrated') return true;
    return !!process.env.HOST_HOME;
}

function getConfiguredImage(): string {
    const defaultImage = 'ghcr.io/pompeii-labs/nero-oss:latest';
    const setupPath = join(getConfigDir(), 'setup.json');
    if (!existsSync(setupPath)) return defaultImage;

    try {
        const setup = JSON.parse(readFileSync(setupPath, 'utf-8')) as { image?: string };
        return setup.image || defaultImage;
    } catch {
        return defaultImage;
    }
}

function triggerIntegratedRestart(): void {
    const hostHome = process.env.HOST_HOME?.trim();
    if (hostHome) {
        const image = getConfiguredImage();
        const helperName = `nero-restart-helper-${Date.now()}`;
        const logPath = `${hostHome}/.nero/restart.log`;

        const child = spawn(
            'docker',
            [
                'run',
                '--rm',
                '-d',
                '--name',
                helperName,
                '-v',
                '/var/run/docker.sock:/var/run/docker.sock',
                '-v',
                `${hostHome}:/host/home`,
                '-v',
                `${hostHome}:${hostHome}`,
                '-e',
                `HOST_HOME=${hostHome}`,
                '-e',
                `HOME=${hostHome}`,
                '-e',
                'DOCKER_HOST=unix:///var/run/docker.sock',
                '-e',
                'DOCKER_CONTEXT=default',
                image,
                'sh',
                '-lc',
                `HOME="$HOST_HOME" nero restart >> "${logPath}" 2>&1`,
            ],
            {
                detached: true,
                stdio: 'ignore',
            },
        );

        child.unref();
        return;
    }

    const child = spawn('sh', ['-lc', 'nero restart'], {
        detached: true,
        stdio: 'ignore',
    });
    child.unref();
}

function parseEnvFile(content: string): Record<string, string> {
    const env: Record<string, string> = {};
    const lines = content.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;

        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        env[key] = value;
    }

    return env;
}

function serializeEnvFile(env: Record<string, string>): string {
    const lines: string[] = [];

    for (const key of ENV_KEYS) {
        if (env[key] !== undefined && env[key] !== '') {
            lines.push(`${key}=${env[key]}`);
        }
    }

    for (const [key, value] of Object.entries(env)) {
        if (!ENV_KEYS.includes(key) && value !== undefined && value !== '') {
            lines.push(`${key}=${value}`);
        }
    }

    return lines.join('\n') + '\n';
}

export function createAdminRouter() {
    const router = Router();

    router.get('/admin/env', async (req: Request, res: Response) => {
        if (!canReadEnv()) {
            res.status(403).json({
                error: 'Env management from dashboard is disabled in contained mode.',
                manualCommand: 'Edit ~/.nero/.env on the host and run: nero restart',
            });
            return;
        }

        try {
            const envPath = getEnvPath();
            let envVars: Record<string, string> = {};

            if (existsSync(envPath)) {
                const content = await readFile(envPath, 'utf-8');
                envVars = parseEnvFile(content);
            }

            if (process.env.NERO_MODE === 'contained') {
                for (const key of ENV_KEYS) {
                    if (process.env[key]) {
                        envVars[key] = process.env[key] as string;
                    }
                }
            }

            const result: Record<string, { value: string; isSet: boolean }> = {};
            for (const key of ENV_KEYS) {
                const value = envVars[key] || '';
                result[key] = {
                    value: value ? '••••••••' : '',
                    isSet: !!value,
                };
            }

            res.json({ env: result, path: envPath });
        } catch (error) {
            logger.error(`Failed to read env: ${(error as Error).message}`);
            res.status(500).json({ error: (error as Error).message });
        }
    });

    router.post('/admin/env', async (req: Request, res: Response) => {
        if (!canManageEnv()) {
            res.status(403).json({
                error: 'Env management from dashboard is disabled in contained mode.',
                manualCommand: 'Edit ~/.nero/.env on the host and run: nero restart',
            });
            return;
        }

        try {
            const { env: newEnv } = req.body as { env: Record<string, string> };

            if (!newEnv || typeof newEnv !== 'object') {
                res.status(400).json({ error: 'Invalid env object' });
                return;
            }

            const envPath = getEnvPath();
            let existingEnv: Record<string, string> = {};

            if (existsSync(envPath)) {
                const content = await readFile(envPath, 'utf-8');
                existingEnv = parseEnvFile(content);
            }

            for (const [key, value] of Object.entries(newEnv)) {
                if (!ENV_KEYS.includes(key)) continue;

                if (value === '' || value === null || value === undefined) {
                    delete existingEnv[key];
                } else if (value !== '••••••••') {
                    existingEnv[key] = value;
                }
            }

            const content = serializeEnvFile(existingEnv);
            await writeFile(envPath, content, 'utf-8');

            logger.info('Environment variables updated');
            res.json({ success: true, message: 'Environment updated. Restart to apply changes.' });
        } catch (error) {
            logger.error(`Failed to write env: ${(error as Error).message}`);
            res.status(500).json({ error: (error as Error).message });
        }
    });

    router.post('/admin/restart', async (req: Request, res: Response) => {
        if (!isIntegratedMode()) {
            res.status(403).json({
                error: 'Dashboard restart is disabled in contained mode.',
                manualCommand: 'Run: nero restart',
            });
            return;
        }

        try {
            triggerIntegratedRestart();
            logger.info('Restart requested from dashboard (integrated mode)');
            res.json({ success: true, message: 'Recreating container...' });
        } catch (error) {
            const message = (error as Error).message;
            logger.error(`Failed to trigger restart: ${message}`);
            res.status(500).json({
                error: `Failed to trigger restart: ${message}`,
                manualCommand: 'Run: nero restart',
            });
        }
    });

    return router;
}
