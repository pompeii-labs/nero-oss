import { Router, Request, Response } from 'express';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { Logger } from '../../util/logger.js';

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
    const neroDir = join(homedir(), '.nero');
    return join(neroDir, '.env');
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
        try {
            const envPath = getEnvPath();
            let envVars: Record<string, string> = {};

            if (existsSync(envPath)) {
                const content = await readFile(envPath, 'utf-8');
                envVars = parseEnvFile(content);
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
        logger.info('Restart requested from dashboard');
        res.json({ success: true, message: 'Restarting...' });

        setTimeout(() => {
            logger.info('Exiting for restart...');
            process.exit(0);
        }, 500);
    });

    return router;
}
