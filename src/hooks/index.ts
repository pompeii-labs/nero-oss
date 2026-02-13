import { execFile } from 'child_process';
import { homedir } from 'os';
import chalk from 'chalk';
import type { NeroConfig, HookEvent, HookConfig } from '../config.js';

export interface HookContext {
    event: HookEvent;
    tool?: string;
    args?: Record<string, unknown>;
    result?: string;
    error?: string;
    message?: string;
    content?: string;
    medium?: string;
    toolCount?: number;
    sessionId?: string;
    cwd: string;
}

export interface HookResult {
    blocked: boolean;
    reason?: string;
}

const DEFAULT_TIMEOUT = 10_000;

function resolveHome(cmd: string): string {
    if (cmd.startsWith('~/')) {
        return homedir() + cmd.slice(1);
    }
    return cmd;
}

export class HooksManager {
    private config: NeroConfig;
    private verbose: boolean;

    constructor(config: NeroConfig) {
        this.config = config;
        this.verbose = config.settings.verbose;
    }

    async runPreToolUse(
        tool: string,
        args: Record<string, unknown>,
        cwd: string,
    ): Promise<HookResult> {
        const context: HookContext = { event: 'PreToolUse', tool, args, cwd };
        return this.executeHooks('PreToolUse', context, true);
    }

    async runPostToolUse(
        tool: string,
        args: Record<string, unknown>,
        result: string | undefined,
        error: string | undefined,
        cwd: string,
    ): Promise<void> {
        const context: HookContext = { event: 'PostToolUse', tool, args, result, error, cwd };
        await this.executeHooks('PostToolUse', context, false);
    }

    async runOnPrompt(message: string, medium: string, cwd: string): Promise<void> {
        const context: HookContext = { event: 'OnPrompt', message, medium, cwd };
        await this.executeHooks('OnPrompt', context, false);
    }

    async runOnResponse(content: string, cwd: string): Promise<void> {
        const context: HookContext = { event: 'OnResponse', content, cwd };
        await this.executeHooks('OnResponse', context, false);
    }

    async runOnMainFinish(content: string, toolCount: number, cwd: string): Promise<void> {
        const context: HookContext = { event: 'OnMainFinish', content, toolCount, cwd };
        await this.executeHooks('OnMainFinish', context, false);
    }

    async runOnError(error: string, tool: string | undefined, cwd: string): Promise<void> {
        const context: HookContext = { event: 'OnError', error, tool, cwd };
        await this.executeHooks('OnError', context, false);
    }

    async runOnSessionStart(sessionId: string, cwd: string): Promise<void> {
        const context: HookContext = { event: 'OnSessionStart', sessionId, cwd };
        await this.executeHooks('OnSessionStart', context, false);
    }

    private async executeHooks(
        event: HookEvent,
        context: HookContext,
        canBlock: boolean,
    ): Promise<HookResult> {
        const hooks = this.config.hooks?.[event];
        if (!hooks || hooks.length === 0) return { blocked: false };

        const matching = hooks.filter((hook) => this.matchesHook(hook, context));
        if (matching.length === 0) return { blocked: false };

        for (const hook of matching) {
            try {
                const timeout = hook.timeout ?? DEFAULT_TIMEOUT;
                const { exitCode, stdout, stderr } = await this.runCommand(
                    hook.command,
                    context,
                    timeout,
                );

                if (canBlock && exitCode !== 0) {
                    const reason = (stdout || stderr || '').trim() || 'Blocked by hook';
                    if (this.verbose) {
                        console.log(
                            chalk.dim(`[hooks] ${event} blocked by ${hook.command}: ${reason}`),
                        );
                    }
                    return { blocked: true, reason };
                }

                if (exitCode !== 0 && this.verbose) {
                    console.log(
                        chalk.dim(
                            `[hooks] ${event} hook ${hook.command} exited with code ${exitCode}`,
                        ),
                    );
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (this.verbose) {
                    console.log(chalk.dim(`[hooks] ${event} hook error (${hook.command}): ${msg}`));
                }
                if (canBlock && msg.includes('TIMEOUT')) {
                    return { blocked: true, reason: `Hook timed out: ${hook.command}` };
                }
            }
        }

        return { blocked: false };
    }

    private matchesHook(hook: HookConfig, context: HookContext): boolean {
        if (!hook.match) return true;

        try {
            const regex = new RegExp(hook.match);

            if (context.event === 'PreToolUse' || context.event === 'PostToolUse') {
                return context.tool ? regex.test(context.tool) : false;
            }

            if (context.event === 'OnPrompt') {
                return context.medium ? regex.test(context.medium) : true;
            }

            return true;
        } catch {
            if (this.verbose) {
                console.log(chalk.dim(`[hooks] Invalid match pattern: ${hook.match}`));
            }
            return false;
        }
    }

    private runCommand(
        command: string,
        context: HookContext,
        timeout: number,
    ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
        return new Promise((resolve, reject) => {
            const resolved = resolveHome(command);
            const child = execFile('sh', ['-c', resolved], { timeout }, (error, stdout, stderr) => {
                if (error && 'killed' in error && error.killed) {
                    reject(new Error('TIMEOUT'));
                    return;
                }
                const exitCode = error ? ((error as any).code ?? 1) : 0;
                resolve({ exitCode, stdout: String(stdout), stderr: String(stderr) });
            });

            if (child.stdin) {
                child.stdin.write(JSON.stringify(context));
                child.stdin.end();
            }
        });
    }
}
