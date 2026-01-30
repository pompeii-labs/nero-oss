import { existsSync } from 'fs';
import { homedir, platform } from 'os';
import { join } from 'path';

const SOCKET_PATHS = {
    linux: ['/var/run/docker.sock'],
    darwin: [join(homedir(), '.docker/run/docker.sock'), '/var/run/docker.sock'],
    win32: ['/var/run/docker.sock'],
};

export function getDockerSocketPath(): string | null {
    const os = platform();
    const candidates = SOCKET_PATHS[os as keyof typeof SOCKET_PATHS] ?? SOCKET_PATHS.linux;

    for (const path of candidates) {
        if (existsSync(path)) {
            return path;
        }
    }

    return null;
}

export function getDockerSocketMount(): string | null {
    const socketPath = getDockerSocketPath();
    if (!socketPath) return null;

    return `${socketPath}:/var/run/docker.sock`;
}

export function isDockerAvailable(): boolean {
    return getDockerSocketPath() !== null;
}
