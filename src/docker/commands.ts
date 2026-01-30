import { execSync } from 'child_process';
import type { DockerConfig } from './types.js';

const IMAGE = 'ghcr.io/pompeii-labs/nero-oss:latest';

export function hasComposeV2(): boolean {
    try {
        execSync('docker compose version', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

export function getComposeCommand(): string {
    return hasComposeV2() ? 'docker compose' : 'docker-compose';
}

export function generateRunScript(config: DockerConfig): string {
    const isIntegrated = config.mode === 'integrated';

    const args = ['docker run -d', `--name ${config.name}`, '--restart unless-stopped'];

    if (isIntegrated) {
        args.push('--network host');
        args.push('-v ~/.nero:/host/home/.nero');
        args.push('-v ~:/host/home');
        args.push('-v /var/run/docker.sock:/var/run/docker.sock');
        args.push('-e HOST_HOME=$HOME');
        args.push('-e GIT_DISCOVERY_ACROSS_FILESYSTEM=1');
        args.push('-e NERO_MODE=integrated');
    } else {
        args.push(`-p ${config.port}:4848`);
        args.push('-v nero_config:/app/config');
        args.push('-e NERO_MODE=contained');
    }

    args.push('--env-file ~/.nero/.env');
    args.push(config.image);

    return `#!/bin/bash\n${args.join(' \\\n  ')}\n`;
}

export interface ExecOptions {
    cwd?: string;
    stdio?: 'inherit' | 'pipe' | 'ignore';
}

export const docker = {
    pull(image: string = IMAGE, options: ExecOptions = {}): void {
        execSync(`docker pull ${image}`, { stdio: options.stdio ?? 'inherit' });
    },

    stop(name: string, options: ExecOptions = {}): boolean {
        try {
            execSync(`docker stop ${name}`, { stdio: options.stdio ?? 'pipe' });
            return true;
        } catch {
            return false;
        }
    },

    rm(name: string, options: ExecOptions = {}): boolean {
        try {
            execSync(`docker rm ${name}`, { stdio: options.stdio ?? 'pipe' });
            return true;
        } catch {
            return false;
        }
    },

    stopAndRemove(name: string, options: ExecOptions = {}): boolean {
        try {
            execSync(`docker stop ${name} && docker rm ${name}`, {
                stdio: options.stdio ?? 'pipe',
            });
            return true;
        } catch {
            return false;
        }
    },

    run(script: string, options: ExecOptions = {}): void {
        execSync(`bash -c '${script}'`, { stdio: options.stdio ?? 'inherit' });
    },

    inspect(name: string): Record<string, any> | null {
        try {
            const output = execSync(`docker inspect ${name}`, { encoding: 'utf-8' });
            const data = JSON.parse(output);
            return data[0] ?? null;
        } catch {
            return null;
        }
    },

    isRunning(name: string): boolean {
        const info = docker.inspect(name);
        return info?.State?.Running === true;
    },
};

export const compose = {
    pull(cwd: string, options: ExecOptions = {}): void {
        const cmd = getComposeCommand();
        execSync(`${cmd} pull`, { cwd, stdio: options.stdio ?? 'inherit' });
    },

    up(cwd: string, options: ExecOptions = {}): void {
        const cmd = getComposeCommand();
        execSync(`${cmd} up -d`, { cwd, stdio: options.stdio ?? 'inherit' });
    },

    down(cwd: string, options: ExecOptions = {}): void {
        const cmd = getComposeCommand();
        execSync(`${cmd} down`, { cwd, stdio: options.stdio ?? 'inherit' });
    },

    restart(cwd: string, options: ExecOptions = {}): void {
        compose.down(cwd, options);
        compose.up(cwd, options);
    },

    logs(cwd: string, service?: string, options: ExecOptions = {}): string {
        const cmd = getComposeCommand();
        const serviceArg = service ? ` ${service}` : '';
        return execSync(`${cmd} logs${serviceArg}`, { cwd, encoding: 'utf-8' });
    },
};

export const DEFAULT_IMAGE = IMAGE;
