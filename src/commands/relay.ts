import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import { join } from 'path';
import { mkdir, writeFile, readFile, unlink } from 'fs/promises';
import { spawn, execSync } from 'child_process';
import { loadConfig, getNeroHome } from '../config.js';

const TUNNEL_STATE_FILE = join(getNeroHome(), '.nero', 'tunnel.json');
const RELAY_WATCH_STATE_FILE = join(getNeroHome(), '.nero', 'relay-watch.json');
const BACKEND_API = process.env.BACKEND_URL || 'https://api.magmadeploy.com';

interface TunnelState {
    pid: number;
    url: string;
    tool: 'cloudflared' | 'ngrok';
    port: string;
    startedAt: string;
}

interface WatchState {
    pid: number;
    startedAt: string;
}

type TunnelTool = 'cloudflared' | 'ngrok';

function isProcessRunning(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function saveTunnelState(state: TunnelState): Promise<void> {
    await mkdir(join(getNeroHome(), '.nero'), { recursive: true });
    await writeFile(TUNNEL_STATE_FILE, JSON.stringify(state, null, 2));
}

async function loadTunnelState(): Promise<TunnelState | null> {
    try {
        const data = await readFile(TUNNEL_STATE_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return null;
    }
}

async function clearTunnelState(): Promise<void> {
    try {
        await unlink(TUNNEL_STATE_FILE);
    } catch {}
}

async function saveWatchState(state: WatchState): Promise<void> {
    await mkdir(join(getNeroHome(), '.nero'), { recursive: true });
    await writeFile(RELAY_WATCH_STATE_FILE, JSON.stringify(state, null, 2));
}

async function loadWatchState(): Promise<WatchState | null> {
    try {
        const data = await readFile(RELAY_WATCH_STATE_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return null;
    }
}

async function clearWatchState(): Promise<void> {
    try {
        await unlink(RELAY_WATCH_STATE_FILE);
    } catch {}
}

async function registerTunnelUrlWithBackend(tunnelUrl: string): Promise<void> {
    const config = await loadConfig();
    const licenseKey = config.licenseKey || process.env.NERO_LICENSE_KEY;
    if (!licenseKey) {
        return;
    }

    try {
        const response = await fetch(`${BACKEND_API}/v1/license/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-license-key': licenseKey,
            },
            body: JSON.stringify({ tunnel_url: tunnelUrl }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error((error as { message: string }).message || 'Registration failed');
        }

        console.log(chalk.green('Auto-registered tunnel URL with backend.'));
    } catch (error) {
        console.error(chalk.red(`Auto-register failed: ${(error as Error).message}`));
    }
}

async function runTunnelStart(
    options: {
        ngrok?: boolean;
        cloudflared?: boolean;
        port?: string;
    },
    context: {
        label: string;
        stopHint: string;
        defaultPort: string;
        onDaemonStarted?: (state: TunnelState) => Promise<void> | void;
        keepAlive?: boolean;
    },
): Promise<void> {
    const port = options.port || context.defaultPort;
    const useNgrok = options.ngrok;
    const useCloudflared = options.cloudflared;
    const daemon = true;

    const existingState = await loadTunnelState();
    if (existingState && isProcessRunning(existingState.pid)) {
        console.log(chalk.yellow(`${context.label} already running.`));
        console.log(chalk.dim(`  URL: ${existingState.url}`));
        console.log(chalk.dim(`  PID: ${existingState.pid}`));
        console.log(chalk.dim(`\nRun \`${context.stopHint}\` to stop it.`));
        if (context.keepAlive) return;
        process.exit(0);
    }

    const hasCommand = (cmd: string): boolean => {
        try {
            execSync(`which ${cmd}`, { stdio: 'ignore' });
            return true;
        } catch {
            return false;
        }
    };

    let tool: TunnelTool;

    if (useNgrok) {
        if (!hasCommand('ngrok')) {
            console.error(chalk.red('ngrok not found.'));
            console.log(chalk.dim('\nInstall: https://ngrok.com/download'));
            console.log(chalk.dim('  brew install ngrok  (macOS)'));
            process.exit(1);
        }
        tool = 'ngrok';
    } else if (useCloudflared) {
        if (!hasCommand('cloudflared')) {
            console.error(chalk.red('cloudflared not found.'));
            console.log(
                chalk.dim(
                    '\nInstall: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/',
                ),
            );
            console.log(chalk.dim('  brew install cloudflared  (macOS)'));
            process.exit(1);
        }
        tool = 'cloudflared';
    } else {
        if (hasCommand('cloudflared')) {
            tool = 'cloudflared';
        } else if (hasCommand('ngrok')) {
            tool = 'ngrok';
        } else {
            console.error(chalk.red('No tunnel tool found.'));
            console.log(chalk.dim('\nInstall one of:'));
            console.log(chalk.dim('  brew install cloudflared  (recommended, free)'));
            console.log(chalk.dim('  brew install ngrok'));
            process.exit(1);
        }
    }

    console.log(chalk.dim(`Starting ${tool} ${context.label.toLowerCase()} on port ${port}...`));

    const TUNNEL_LOG_FILE = join(getNeroHome(), '.nero', 'tunnel.log');
    await mkdir(join(getNeroHome(), '.nero'), { recursive: true });

    if (daemon) {
        await writeFile(TUNNEL_LOG_FILE, '');

        const logFd = fs.openSync(TUNNEL_LOG_FILE, 'a');

        const proc = spawn(
            tool === 'cloudflared' ? 'cloudflared' : 'ngrok',
            tool === 'cloudflared'
                ? ['tunnel', '--url', `http://localhost:${port}`]
                : ['http', port],
            {
                stdio: ['ignore', logFd, logFd],
                detached: true,
            },
        );

        proc.unref();

        const pollForUrl = async (): Promise<string | null> => {
            const maxAttempts = 30;
            for (let i = 0; i < maxAttempts; i++) {
                await new Promise((r) => setTimeout(r, 500));

                if (tool === 'cloudflared') {
                    try {
                        const log = await readFile(TUNNEL_LOG_FILE, 'utf-8');
                        const match = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
                        if (match) return match[0];
                    } catch {}
                } else {
                    try {
                        const response = await fetch('http://localhost:4040/api/tunnels');
                        const data = (await response.json()) as {
                            tunnels: Array<{ public_url: string }>;
                        };
                        const tunnelInfo = data.tunnels.find((t: { public_url: string }) =>
                            t.public_url.startsWith('https'),
                        );
                        if (tunnelInfo) return tunnelInfo.public_url;
                    } catch {}
                }
            }
            return null;
        };

        const url = await pollForUrl();

        if (!url) {
            console.error(chalk.red('Failed to get tunnel URL. Check ~/.nero/tunnel.log'));
            process.exit(1);
        }

        const state: TunnelState = {
            pid: proc.pid!,
            url,
            tool,
            port,
            startedAt: new Date().toISOString(),
        };

        await saveTunnelState(state);

        console.log(chalk.bold.green(`\n  ${context.label} URL: ${url}`));
        console.log(chalk.dim(`  Running in background (PID: ${proc.pid})`));
        console.log(chalk.dim(`  Run \`${context.stopHint}\` to stop.\n`));
        await registerTunnelUrlWithBackend(url);
        if (context.onDaemonStarted) {
            await context.onDaemonStarted(state);
        }
        if (context.keepAlive) return;
        process.exit(0);
    }
}

async function runTunnelStop(context: { label: string; stopHint: string }): Promise<void> {
    const state = await loadTunnelState();

    if (!state) {
        console.log(chalk.yellow(`No ${context.label.toLowerCase()} running.`));
        process.exit(0);
    }

    if (!isProcessRunning(state.pid)) {
        console.log(chalk.yellow(`${context.label} process not found (may have crashed).`));
        await clearTunnelState();
        process.exit(0);
    }

    try {
        process.kill(state.pid, 'SIGTERM');
        await clearTunnelState();
        console.log(chalk.green(`${context.label} stopped (PID: ${state.pid})`));
    } catch (error) {
        console.error(
            chalk.red(`Failed to stop ${context.label.toLowerCase()}: ${(error as Error).message}`),
        );
        process.exit(1);
    }
}

async function runTunnelStatus(context: { label: string; startHint: string }): Promise<void> {
    const state = await loadTunnelState();

    if (!state) {
        console.log(chalk.yellow(`No ${context.label.toLowerCase()} configured.`));
        console.log(chalk.dim(`\nStart one with: ${context.startHint}`));
        process.exit(0);
    }

    const running = isProcessRunning(state.pid);

    console.log(chalk.bold(`\n${context.label} Status:\n`));
    console.log(`  Status: ${running ? chalk.green('running') : chalk.red('stopped')}`);
    console.log(`  URL: ${chalk.cyan(state.url)}`);
    console.log(`  Tool: ${state.tool}`);
    console.log(`  Port: ${state.port}`);
    console.log(`  PID: ${state.pid}`);
    console.log(`  Started: ${new Date(state.startedAt).toLocaleString()}`);
    console.log();

    if (!running) {
        await clearTunnelState();
        console.log(chalk.dim(`Tunnel state cleared. Start a new one with: ${context.startHint}`));
    }
}

async function startRelayWatchProcess(): Promise<void> {
    const existing = await loadWatchState();
    if (existing && isProcessRunning(existing.pid)) {
        return;
    }

    const execPath = process.execPath;
    const scriptPath = process.argv[1];
    const args = scriptPath ? [scriptPath, 'relay', 'watch'] : ['relay', 'watch'];

    const proc = spawn(execPath, args, { stdio: 'ignore', detached: true });
    proc.unref();

    await saveWatchState({
        pid: proc.pid!,
        startedAt: new Date().toISOString(),
    });
}

async function stopRelayWatchProcess(): Promise<void> {
    const state = await loadWatchState();
    if (!state) return;
    if (isProcessRunning(state.pid)) {
        try {
            process.kill(state.pid, 'SIGTERM');
        } catch {}
    }
    await clearWatchState();
}

export function registerRelayCommands(program: Command) {
    const tunnel = program
        .command('tunnel')
        .description('Manage tunnel to expose Nero to the internet (deprecated; use `relay`)');

    tunnel
        .command('start', { isDefault: true })
        .description('Start a tunnel')
        .option('-n, --ngrok', 'Use ngrok (requires account)')
        .option('-c, --cloudflared', 'Use Cloudflare Tunnel (free, no account)')
        .option('-p, --port <port>', 'Local port to tunnel')
        .action(async (options) => {
            console.log(chalk.yellow('`nero tunnel` is deprecated. Use `nero relay` instead.'));
            const config = await loadConfig();
            const defaultPort = String(config.relayPort || 4848);
            await runTunnelStart(options, {
                label: 'Tunnel',
                stopHint: 'nero tunnel stop',
                defaultPort,
            });
        });

    tunnel
        .command('stop')
        .description('Stop the background tunnel')
        .action(async () => {
            console.log(chalk.yellow('`nero tunnel` is deprecated. Use `nero relay` instead.'));
            await runTunnelStop({ label: 'Tunnel', stopHint: 'nero tunnel stop' });
        });

    tunnel
        .command('status')
        .description('Show tunnel status')
        .action(async () => {
            console.log(chalk.yellow('`nero tunnel` is deprecated. Use `nero relay` instead.'));
            await runTunnelStatus({ label: 'Tunnel', startHint: 'nero tunnel start' });
        });

    const relay = program.command('relay').description('Manage relay (tunnel + webhook proxy)');

    relay
        .command('start', { isDefault: true })
        .description('Start the relay (starts tunnel under the hood)')
        .option('-n, --ngrok', 'Use ngrok (requires account)')
        .option('-c, --cloudflared', 'Use Cloudflare Tunnel (free, no account)')
        .option('-p, --port <port>', 'Relay port to expose (default: 4848)')
        .action(async (options) => {
            const config = await loadConfig();
            const defaultPort = options.port || String(config.relayPort || 4848);
            await runTunnelStart(options, {
                label: 'Relay',
                stopHint: 'nero relay stop',
                defaultPort,
                onDaemonStarted: async () => {
                    await startRelayWatchProcess();
                },
            });
        });

    relay
        .command('stop')
        .description('Stop the relay (stops tunnel)')
        .action(async () => {
            await stopRelayWatchProcess();
            await runTunnelStop({ label: 'Relay', stopHint: 'nero relay stop' });
        });

    relay
        .command('status')
        .description('Show relay status')
        .action(async () => {
            await runTunnelStatus({ label: 'Relay', startHint: 'nero relay start' });
            const watch = await loadWatchState();
            if (watch && isProcessRunning(watch.pid)) {
                console.log(chalk.dim(`  Watcher: running (PID: ${watch.pid})`));
            } else {
                console.log(chalk.dim(`  Watcher: not running`));
                if (watch) {
                    await clearWatchState();
                }
            }
        });

    relay
        .command('watch')
        .description('Watch relay tunnel and auto-restart if it dies')
        .action(async () => {
            const config = await loadConfig();
            const intervalMs = 60_000;
            let consecutiveFailures = 0;

            const isTunnelHealthy = async (url: string): Promise<boolean> => {
                try {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 10_000);
                    const res = await fetch(`${url}/relay/health`, { signal: controller.signal });
                    clearTimeout(timeout);
                    return res.ok;
                } catch {
                    return false;
                }
            };

            const killAndRestart = async (state: TunnelState | null) => {
                if (state && isProcessRunning(state.pid)) {
                    try {
                        process.kill(state.pid, 'SIGTERM');
                    } catch {}
                    await new Promise((r) => setTimeout(r, 2_000));
                    if (isProcessRunning(state.pid)) {
                        try {
                            process.kill(state.pid, 'SIGKILL');
                        } catch {}
                    }
                }
                await clearTunnelState();

                const options: {
                    ngrok?: boolean;
                    cloudflared?: boolean;
                    port?: string;
                    daemon?: boolean;
                } = {
                    daemon: true,
                    port: String(config.relayPort || 4848),
                };

                if (state?.tool === 'ngrok') {
                    options.ngrok = true;
                } else if (state?.tool === 'cloudflared') {
                    options.cloudflared = true;
                }

                await runTunnelStart(options, {
                    label: 'Relay',
                    stopHint: 'nero relay stop',
                    defaultPort: String(config.relayPort || 4848),
                    keepAlive: true,
                });
            };

            const loop = async () => {
                const state = await loadTunnelState();
                const running = state ? isProcessRunning(state.pid) : false;

                if (!state || !running) {
                    consecutiveFailures = 0;
                    await killAndRestart(state);
                    return;
                }

                const healthy = await isTunnelHealthy(state.url);
                if (!healthy) {
                    consecutiveFailures++;
                    if (consecutiveFailures >= 2) {
                        console.log(
                            chalk.yellow(
                                `[relay-watch] Tunnel unhealthy (${consecutiveFailures} checks), restarting...`,
                            ),
                        );
                        consecutiveFailures = 0;
                        await killAndRestart(state);
                        return;
                    }
                } else {
                    consecutiveFailures = 0;
                }

                try {
                    await registerTunnelUrlWithBackend(state.url);
                } catch {}
            };

            await loop();
            setInterval(loop, intervalMs);
        });
}
