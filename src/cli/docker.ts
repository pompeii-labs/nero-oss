/** Thin wrapper over `docker compose` against the managed stack in ~/.nero. */
import { spawnSync } from 'child_process';
import { COMPOSE_PATH, ENV_PATH } from './home';
import { die } from './term';

const BASE = ['compose', '-f', COMPOSE_PATH, '--env-file', ENV_PATH];

/** Verify the Docker CLI + daemon are usable; exit with guidance if not. */
export function ensureDocker(): void {
    const v = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
        encoding: 'utf8',
    });
    if (v.error) die('Docker not found. Install Docker Desktop, then run `nero start` again.');
    if (v.status !== 0) die('Docker is installed but not running. Start Docker, then try again.');
}

/** Run a compose subcommand, inheriting the terminal (for up/down/logs). */
export function compose(args: string[]): number {
    const r = spawnSync('docker', [...BASE, ...args], { stdio: 'inherit' });
    return r.status ?? 1;
}

/** Run a compose subcommand and capture stdout (for ps/status). */
export function composeCapture(args: string[]): string {
    const r = spawnSync('docker', [...BASE, ...args], { encoding: 'utf8' });
    return r.stdout ?? '';
}
