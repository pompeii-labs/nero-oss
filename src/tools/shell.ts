import { exec } from 'child_process';
import { promisify } from 'util';
import { homedir } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);

/** Expand a leading ~ to the user's home directory. */
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

/** Run a shell command. Single-user local box, so full access by design. */
export async function runShell(
    command: string,
    opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<ShellResult> {
    try {
        const { stdout, stderr } = await execAsync(command, {
            cwd: opts.cwd ? expandPath(opts.cwd) : process.cwd(),
            timeout: opts.timeoutMs ?? 120_000,
            maxBuffer: 10 * 1024 * 1024,
            shell: '/bin/bash',
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

/** Format a shell result for a tool return. */
export function formatShell(r: ShellResult): string {
    const parts: string[] = [];
    if (r.stdout) parts.push(r.stdout.trimEnd());
    if (r.stderr) parts.push(`[stderr]\n${r.stderr.trimEnd()}`);
    if (r.code !== 0) parts.push(`[exit ${r.code}]`);
    return parts.join('\n') || '(no output)';
}
