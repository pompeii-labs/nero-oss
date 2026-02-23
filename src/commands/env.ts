import { Command } from 'commander';
import chalk from 'chalk';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { getConfigDir } from '../config.js';

function getEnvPath(): string {
    return join(getConfigDir(), '.env');
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
    const keys = Object.keys(env).sort();
    const lines: string[] = [];

    for (const key of keys) {
        const value = env[key];
        if (value !== undefined && value !== '') {
            lines.push(`${key}=${value}`);
        }
    }

    return lines.join('\n') + '\n';
}

async function readEnvMap(): Promise<Record<string, string>> {
    const envPath = getEnvPath();
    if (!existsSync(envPath)) return {};
    const content = await readFile(envPath, 'utf-8');
    return parseEnvFile(content);
}

async function writeEnvMap(env: Record<string, string>): Promise<void> {
    const dir = getConfigDir();
    await mkdir(dir, { recursive: true });
    await writeFile(getEnvPath(), serializeEnvFile(env), 'utf-8');
}

function assertEnvKey(key: string): void {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        throw new Error(`Invalid env key: ${key}`);
    }
}

export function registerEnvCommands(program: Command) {
    const env = program.command('env').description('Manage ~/.nero/.env values');

    env.command('list')
        .description('List env vars from ~/.nero/.env')
        .option('--show-values', 'Show full values instead of masking')
        .action(async (options: { showValues?: boolean }) => {
            const values = await readEnvMap();
            const entries = Object.entries(values).sort(([a], [b]) => a.localeCompare(b));

            if (entries.length === 0) {
                console.log(chalk.dim(`No env vars set in ${getEnvPath()}`));
                return;
            }

            for (const [key, value] of entries) {
                if (options.showValues) {
                    console.log(`${key}=${value}`);
                } else {
                    console.log(`${key}=${value ? '••••••••' : ''}`);
                }
            }
        });

    env.command('get <key>')
        .description('Get one env var from ~/.nero/.env')
        .option('--show-value', 'Show full value instead of masking')
        .action(async (key: string, options: { showValue?: boolean }) => {
            assertEnvKey(key);
            const values = await readEnvMap();
            const value = values[key];
            if (value === undefined) {
                console.log(chalk.dim('(not set)'));
                return;
            }
            if (options.showValue) {
                console.log(value);
                return;
            }
            console.log(value ? '••••••••' : '');
        });

    env.command('set <key> <value>')
        .description('Set one env var in ~/.nero/.env')
        .action(async (key: string, value: string) => {
            assertEnvKey(key);
            const values = await readEnvMap();
            values[key] = value;
            await writeEnvMap(values);
            console.log(chalk.green(`Set ${key} in ${getEnvPath()}`));
        });

    env.command('unset <key>')
        .description('Remove one env var from ~/.nero/.env')
        .action(async (key: string) => {
            assertEnvKey(key);
            const values = await readEnvMap();
            if (!(key in values)) {
                console.log(chalk.dim(`${key} is not set`));
                return;
            }
            delete values[key];
            await writeEnvMap(values);
            console.log(chalk.green(`Removed ${key} from ${getEnvPath()}`));
        });
}
