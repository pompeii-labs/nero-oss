import { runner, expandPath, type ShellResult, type ExecOpts } from '@nero/shared/runner';

export { expandPath };
export type { ShellResult };

/** Run a shell command through the active runner (host in dev, host-runner daemon in
 *  the container). Everything that shells out (bash tool, git ops, grep) goes here. */
export function runShell(command: string, opts: ExecOpts = {}): Promise<ShellResult> {
    return runner().exec(command, opts);
}

/** Format a shell result for a tool return. */
export function formatShell(r: ShellResult): string {
    const parts: string[] = [];
    if (r.stdout) parts.push(r.stdout.trimEnd());
    if (r.stderr) parts.push(`[stderr]\n${r.stderr.trimEnd()}`);
    if (r.code !== 0) parts.push(`[exit ${r.code}]`);
    return parts.join('\n') || '(no output)';
}
