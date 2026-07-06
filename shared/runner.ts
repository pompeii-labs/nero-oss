import { exec } from 'child_process';
import { promisify } from 'util';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { readFile, writeFile, mkdir, readdir } from 'fs/promises';

const execAsync = promisify(exec);

/** Expand a leading ~ to the home of whatever host is executing (the point of a
 *  tilde path: the api emits `~/...` and the runner resolves it on its own machine). */
export function expandPath(p: string): string {
    if (!p) return p;
    if (p === '~') return homedir();
    if (p.startsWith('~/')) return join(homedir(), p.slice(2));
    return p;
}

export interface ShellResult {
    stdout: string;
    stderr: string;
    code: number;
}
export interface ExecOpts {
    cwd?: string;
    timeoutMs?: number;
    env?: Record<string, string>;
}
export interface DirEntry {
    name: string;
    dir: boolean;
}

/** The filesystem + exec surface that code-projects touch. In dev it runs in-process
 *  on the host; in the container it forwards to the host-runner daemon. */
export interface Runner {
    exec(command: string, opts?: ExecOpts): Promise<ShellResult>;
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    mkdir(path: string): Promise<void>;
    readdir(path: string): Promise<DirEntry[]>;
}

/** Runs directly on this machine. Used in dev, and inside the host-runner daemon. */
export class HostRunner implements Runner {
    async exec(command: string, opts: ExecOpts = {}): Promise<ShellResult> {
        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd: opts.cwd ? expandPath(opts.cwd) : process.cwd(),
                timeout: opts.timeoutMs ?? 120_000,
                maxBuffer: 10 * 1024 * 1024,
                shell: '/bin/bash',
                env: opts.env ? { ...process.env, ...opts.env } : process.env,
            });
            return { stdout, stderr, code: 0 };
        } catch (e) {
            const err = e as { stdout?: string; stderr?: string; code?: number; message?: string };
            return {
                stdout: err.stdout ?? '',
                stderr: err.stderr ?? err.message ?? String(e),
                code: typeof err.code === 'number' ? err.code : 1,
            };
        }
    }
    readFile(path: string): Promise<string> {
        return readFile(expandPath(path), 'utf-8');
    }
    async writeFile(path: string, content: string): Promise<void> {
        const abs = expandPath(path);
        await mkdir(dirname(abs), { recursive: true });
        await writeFile(abs, content, 'utf-8');
    }
    async mkdir(path: string): Promise<void> {
        await mkdir(expandPath(path), { recursive: true });
    }
    async readdir(path: string): Promise<DirEntry[]> {
        const es = await readdir(expandPath(path), { withFileTypes: true });
        return es.map((e) => ({ name: e.name, dir: e.isDirectory() }));
    }
}

/** Forwards each op to the host-runner daemon over HTTP (container -> host). */
export class RemoteRunner implements Runner {
    constructor(
        private url: string,
        private token: string,
    ) {}
    private async call<T>(op: string, body: unknown): Promise<T> {
        const res = await fetch(`${this.url.replace(/\/$/, '')}/${op}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`host-runner ${op} failed: ${res.status} ${await res.text()}`);
        return (await res.json()) as T;
    }
    exec(command: string, opts: ExecOpts = {}): Promise<ShellResult> {
        return this.call<ShellResult>('exec', { command, ...opts });
    }
    async readFile(path: string): Promise<string> {
        return (await this.call<{ content: string }>('read', { path })).content;
    }
    async writeFile(path: string, content: string): Promise<void> {
        await this.call('write', { path, content });
    }
    async mkdir(path: string): Promise<void> {
        await this.call('mkdir', { path });
    }
    async readdir(path: string): Promise<DirEntry[]> {
        return (await this.call<{ entries: DirEntry[] }>('readdir', { path })).entries;
    }
}

let _runner: Runner | null = null;
/** RemoteRunner when NERO_RUNNER_URL is set (containerized api), else in-process. */
export function runner(): Runner {
    if (_runner) return _runner;
    const url = process.env.NERO_RUNNER_URL;
    _runner = url ? new RemoteRunner(url, process.env.NERO_RUNNER_TOKEN ?? '') : new HostRunner();
    return _runner;
}
export function __resetRunner(): void {
    _runner = null;
}
