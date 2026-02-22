import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';

export function formatEnvValue(value: string): string {
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
}

export async function upsertEnvValue(envPath: string, key: string, value: string): Promise<void> {
    await mkdir(dirname(envPath), { recursive: true });

    let content = '';
    if (existsSync(envPath)) {
        content = await readFile(envPath, 'utf-8');
    }

    const lines = content.split('\n');
    let found = false;

    const updated = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;

        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) return line;

        const currentKey = trimmed.slice(0, eqIndex).trim();
        if (currentKey !== key) return line;

        found = true;
        return `${key}=${value}`;
    });

    if (!found) {
        if (updated.length > 0 && updated[updated.length - 1] === '') {
            updated.splice(updated.length - 1, 0, `${key}=${value}`);
        } else {
            updated.push(`${key}=${value}`);
        }
    }

    const output = updated.join('\n');
    await writeFile(envPath, output.endsWith('\n') ? output : `${output}\n`, 'utf-8');
}

export async function setConfigJsonEnv(envPath: string, config: unknown): Promise<void> {
    const json = JSON.stringify(config);
    await upsertEnvValue(envPath, 'NERO_CONFIG_JSON', formatEnvValue(json));
}
