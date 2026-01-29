#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { join } from 'path';
import { homedir } from 'os';
import { startRepl } from './cli/repl.js';
import { initDb, migrateDb } from './db/index.js';
import { loadConfig, getConfigPath, saveConfig, updateMcpServerOAuth } from './config.js';
import {
    discoverOAuthMetadata,
    registerClient,
    buildAuthorizationUrl,
    exchangeCodeForTokens,
    openBrowser,
    type StoredOAuthData,
} from './mcp/oauth.js';
import { createServer } from 'http';
import { VERSION } from './util/version.js';
import semver from 'semver';

dotenv.config();

const TUNNEL_STATE_FILE = join(homedir(), '.nero', 'tunnel.json');

interface TunnelState {
    pid: number;
    url: string;
    tool: 'cloudflared' | 'ngrok';
    port: string;
    startedAt: string;
}

async function saveTunnelState(state: TunnelState): Promise<void> {
    const { mkdir, writeFile } = await import('fs/promises');
    await mkdir(join(homedir(), '.nero'), { recursive: true });
    await writeFile(TUNNEL_STATE_FILE, JSON.stringify(state, null, 2));
}

async function loadTunnelState(): Promise<TunnelState | null> {
    const { readFile } = await import('fs/promises');
    try {
        const data = await readFile(TUNNEL_STATE_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return null;
    }
}

async function clearTunnelState(): Promise<void> {
    const { unlink } = await import('fs/promises');
    try {
        await unlink(TUNNEL_STATE_FILE);
    } catch {}
}

function isProcessRunning(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

const program = new Command();

program.name('nero').description('Open source AI companion').version(VERSION, '-v, --version');

async function readStdin(): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf-8').trim();
}

program
    .command('chat', { isDefault: true })
    .description('Start interactive chat session')
    .option('-m, --message <message>', 'Send a single message and exit')
    .option('-p, --pipe', 'Read message from stdin (pipe mode)')
    .action(async (options) => {
        const config = await loadConfig();

        const isPiped = !process.stdin.isTTY;
        const message = options.message || (isPiped ? await readStdin() : null);

        if (message) {
            const { NeroClient } = await import('./client/index.js');
            const { Logger } = await import('./util/logger.js');
            const logger = new Logger('CLI');

            const serviceUrl = process.env.NERO_SERVICE_URL || 'http://localhost:4848';
            const serviceRunning = await NeroClient.checkServiceRunning(serviceUrl);

            if (!serviceRunning) {
                logger.error('Nero service not running');
                console.log(chalk.dim('\nStart the service with:'));
                console.log(chalk.cyan('  docker-compose up -d\n'));
                process.exit(1);
            }

            const client = new NeroClient({ baseUrl: serviceUrl, licenseKey: config.licenseKey });

            try {
                await client.chat(message, (chunk) => {
                    process.stdout.write(chunk);
                });
                console.log();
            } catch (error) {
                const err = error as Error;
                console.error(chalk.red(`Error: ${err.message}`));
                process.exit(1);
            }

            process.exit(0);
        } else {
            await startRepl(config);
        }
    });

program
    .command('migrate')
    .description('Run database migrations')
    .action(async () => {
        console.log(chalk.blue('Running migrations...'));
        await migrateDb();
        console.log(chalk.green('Migrations complete.'));
        process.exit(0);
    });

program
    .command('reload')
    .description('Reload service configuration (MCP servers, etc.)')
    .action(async () => {
        const { NeroClient } = await import('./client/index.js');
        const config = await loadConfig();

        const serviceUrl = process.env.NERO_SERVICE_URL || 'http://localhost:4848';
        const serviceRunning = await NeroClient.checkServiceRunning(serviceUrl);

        if (!serviceRunning) {
            console.error(chalk.red('Nero service not running'));
            console.log(chalk.dim('\nStart the service with:'));
            console.log(chalk.cyan('  docker-compose up -d\n'));
            process.exit(1);
        }

        console.log(chalk.dim('Reloading service configuration...'));
        const client = new NeroClient({ baseUrl: serviceUrl, licenseKey: config.licenseKey });

        try {
            const result = await client.reload();
            console.log(chalk.green(`Reloaded successfully`));
            console.log(chalk.dim(`  MCP tools: ${result.mcpTools}`));
        } catch (error) {
            const err = error as Error;
            console.error(chalk.red(`Reload failed: ${err.message}`));
            process.exit(1);
        }

        process.exit(0);
    });

program
    .command('config')
    .description('Show current configuration')
    .action(async () => {
        const config = await loadConfig();
        console.log(chalk.bold('\nNero Configuration:\n'));

        console.log(chalk.dim('Settings:'));
        console.log(
            `  Streaming: ${config.settings.streaming ? chalk.green('on') : chalk.yellow('off')}`,
        );
        console.log(`  Model: ${chalk.cyan(config.settings.model)}`);
        console.log(
            `  Verbose: ${config.settings.verbose ? chalk.green('on') : chalk.yellow('off')}`,
        );

        console.log(chalk.dim('\nMCP Servers:'));
        const servers = Object.keys(config.mcpServers || {});
        if (servers.length === 0) {
            console.log(chalk.yellow('  No MCP servers configured'));
        } else {
            servers.forEach((name) => {
                console.log(chalk.green(`  - ${name}`));
            });
        }

        console.log(chalk.dim('\nFeatures:'));
        console.log(
            `  Voice: ${config.voice?.enabled ? chalk.green('enabled') : chalk.dim('disabled')}`,
        );
        console.log(
            `  SMS: ${config.sms?.enabled ? chalk.green('enabled') : chalk.dim('disabled')}`,
        );
        console.log(
            `  License Key: ${config.licenseKey ? chalk.green('configured') : chalk.dim('not set')}`,
        );

        console.log(chalk.dim('\nConfig Path:'));
        console.log(`  ${getConfigPath()}`);
        console.log();
    });

program
    .command('open [page]')
    .description('Open Nero dashboard in browser')
    .option('-p, --port <port>', 'Local port', '4848')
    .action(async (page, options) => {
        const baseUrl = `http://localhost:${options.port}`;
        const validPages = ['voice', 'settings', 'mcp', 'memories', 'history'];
        const path = page && validPages.includes(page) ? `/${page}` : '';
        const url = `${baseUrl}${path}`;

        console.log(chalk.dim(`Opening ${url}...`));
        openBrowser(url);
    });

const mcp = program.command('mcp').description('Manage MCP servers');

mcp.command('add <name> [url]')
    .description('Add an MCP server (stdio: use --, http: provide URL)')
    .option('-t, --transport <transport>', 'Transport type: stdio or http', 'stdio')
    .option('-e, --env <env...>', 'Environment variables (KEY=VALUE)')
    .option('-H, --header <header...>', 'HTTP headers (KEY=VALUE) for http transport')
    .option('-s, --scope <scope>', 'Config scope: user or project', 'user')
    .allowUnknownOption()
    .action(async (name, url, options, command) => {
        const config = await loadConfig();

        const env: Record<string, string> = {};
        if (options.env) {
            for (const e of options.env) {
                const [key, ...valueParts] = e.split('=');
                env[key] = valueParts.join('=');
            }
        }

        const headers: Record<string, string> = {};
        if (options.header) {
            for (const h of options.header) {
                const [key, ...valueParts] = h.split('=');
                headers[key] = valueParts.join('=');
            }
        }

        if (options.transport === 'http' || (url && url.startsWith('http'))) {
            if (!url) {
                console.error(chalk.red('Error: URL required for http transport'));
                console.error(chalk.dim('Usage: nero mcp add <name> <url> --transport http'));
                process.exit(1);
            }

            config.mcpServers[name] = {
                transport: 'http',
                url: url,
                headers: Object.keys(headers).length > 0 ? headers : undefined,
                env: Object.keys(env).length > 0 ? env : undefined,
            };

            await saveConfig(config);
            console.log(chalk.green(`Added MCP server: ${name}`));
            console.log(chalk.dim(`  Transport: http`));
            console.log(chalk.dim(`  URL: ${url}`));
            if (Object.keys(headers).length > 0) {
                console.log(chalk.dim(`  Headers: ${Object.keys(headers).join(', ')}`));
            }
        } else {
            const dashIndex = process.argv.indexOf('--');
            let mcpCommand: string;
            let mcpArgs: string[] = [];

            if (dashIndex !== -1) {
                const afterDash = process.argv.slice(dashIndex + 1);
                mcpCommand = afterDash[0];
                mcpArgs = afterDash.slice(1);
            } else if (url) {
                mcpCommand = url;
                mcpArgs = command.args.slice(1);
            } else {
                console.error(chalk.red('Error: No command specified.'));
                console.error(chalk.dim('Stdio:  nero mcp add <name> -- <command> [args...]'));
                console.error(chalk.dim('HTTP:   nero mcp add <name> <url> --transport http'));
                process.exit(1);
            }

            config.mcpServers[name] = {
                transport: 'stdio',
                command: mcpCommand,
                args: mcpArgs.length > 0 ? mcpArgs : undefined,
                env: Object.keys(env).length > 0 ? env : undefined,
            };

            await saveConfig(config);
            console.log(chalk.green(`Added MCP server: ${name}`));
            console.log(chalk.dim(`  Transport: stdio`));
            console.log(chalk.dim(`  Command: ${mcpCommand} ${mcpArgs.join(' ')}`));
            if (Object.keys(env).length > 0) {
                console.log(chalk.dim(`  Env: ${Object.keys(env).join(', ')}`));
            }
        }
    });

mcp.command('list')
    .alias('ls')
    .description('List configured MCP servers')
    .action(async () => {
        const config = await loadConfig();
        const servers = Object.entries(config.mcpServers || {});

        if (servers.length === 0) {
            console.log(chalk.yellow('No MCP servers configured.'));
            console.log(chalk.dim('\nStdio:  nero mcp add <name> -- <command> [args...]'));
            console.log(chalk.dim('HTTP:   nero mcp add <name> <url>'));
            return;
        }

        console.log(chalk.bold('\nMCP Servers:\n'));
        for (const [name, server] of servers) {
            const transport = server.transport || 'stdio';
            console.log(chalk.green(`  ${name}`) + chalk.dim(` (${transport})`));
            if (server.url) {
                console.log(chalk.dim(`    URL: ${server.url}`));
            }
            if (server.command) {
                console.log(
                    chalk.dim(`    Command: ${server.command} ${(server.args || []).join(' ')}`),
                );
            }
            if (server.env) {
                console.log(chalk.dim(`    Env: ${Object.keys(server.env).join(', ')}`));
            }
            if (server.headers) {
                console.log(chalk.dim(`    Headers: ${Object.keys(server.headers).join(', ')}`));
            }
        }
        console.log();
    });

mcp.command('remove <name>')
    .alias('rm')
    .description('Remove an MCP server')
    .action(async (name) => {
        const config = await loadConfig();

        if (!config.mcpServers[name]) {
            console.error(chalk.red(`MCP server not found: ${name}`));
            process.exit(1);
        }

        delete config.mcpServers[name];
        await saveConfig(config);
        console.log(chalk.green(`Removed MCP server: ${name}`));
    });

mcp.command('auth <name>')
    .description('Authenticate with an MCP server using OAuth')
    .option('-p, --port <port>', 'Local port for OAuth callback', '8976')
    .action(async (name, options) => {
        const config = await loadConfig();

        if (!config.mcpServers[name]) {
            console.error(chalk.red(`MCP server not found: ${name}`));
            process.exit(1);
        }

        const serverConfig = config.mcpServers[name];
        if (serverConfig.transport !== 'http' || !serverConfig.url) {
            console.error(chalk.red(`Server ${name} is not an HTTP MCP server`));
            process.exit(1);
        }

        console.log(chalk.dim(`Discovering OAuth metadata for ${name}...`));
        const metadata = await discoverOAuthMetadata(serverConfig.url);

        if (!metadata?.authServer) {
            console.error(chalk.red(`Server ${name} does not support OAuth authentication`));
            process.exit(1);
        }

        console.log(chalk.dim(`Found authorization server: ${metadata.authServer.issuer}`));

        const port = parseInt(options.port);
        const redirectUri = `http://localhost:${port}/callback`;

        let clientRegistration = serverConfig.oauth?.clientRegistration;
        if (!clientRegistration) {
            console.log(chalk.dim('Registering client...'));
            clientRegistration = await registerClient(
                metadata.authServer,
                `nero-${name}`,
                redirectUri,
            );

            if (!clientRegistration) {
                console.error(chalk.red('Failed to register OAuth client'));
                process.exit(1);
            }
            console.log(chalk.dim(`Client registered: ${clientRegistration.client_id}`));
        }

        const { codeVerifier, state, authUrl } = buildAuthorizationUrl({
            authServerMetadata: metadata.authServer,
            clientId: clientRegistration.client_id,
            redirectUri,
        });

        console.log(chalk.blue('\nOpening browser for authentication...'));
        console.log(chalk.dim(`If the browser doesn't open, visit:\n${authUrl}\n`));

        openBrowser(authUrl);

        const tokens = await new Promise<Awaited<ReturnType<typeof exchangeCodeForTokens>>>(
            (resolve, reject) => {
                const server = createServer(async (req, res) => {
                    const url = new URL(req.url || '', `http://localhost:${port}`);

                    if (url.pathname === '/callback') {
                        const code = url.searchParams.get('code');
                        const returnedState = url.searchParams.get('state');
                        const error = url.searchParams.get('error');

                        if (error) {
                            res.writeHead(400, { 'Content-Type': 'text/html' });
                            res.end(
                                `<html><body><h1>Authentication Failed</h1><p>${error}</p></body></html>`,
                            );
                            server.close();
                            reject(new Error(`OAuth error: ${error}`));
                            return;
                        }

                        if (!code || returnedState !== state) {
                            res.writeHead(400, { 'Content-Type': 'text/html' });
                            res.end(
                                '<html><body><h1>Invalid Response</h1><p>Missing code or state mismatch</p></body></html>',
                            );
                            server.close();
                            reject(new Error('Invalid OAuth response'));
                            return;
                        }

                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(
                            '<html><body><h1>Authentication Successful</h1><p>You can close this window.</p></body></html>',
                        );
                        server.close();

                        const tokens = await exchangeCodeForTokens(
                            metadata.authServer!,
                            clientRegistration!.client_id,
                            code,
                            codeVerifier,
                            redirectUri,
                        );
                        resolve(tokens);
                    } else {
                        res.writeHead(404);
                        res.end('Not found');
                    }
                });

                server.listen(port, () => {
                    console.log(chalk.dim(`Waiting for OAuth callback on port ${port}...`));
                });

                server.on('error', (err) => {
                    reject(err);
                });

                setTimeout(
                    () => {
                        server.close();
                        reject(new Error('OAuth timeout - no callback received within 5 minutes'));
                    },
                    5 * 60 * 1000,
                );
            },
        );

        if (!tokens) {
            console.error(chalk.red('Failed to obtain access token'));
            process.exit(1);
        }

        const oauthData: StoredOAuthData = {
            serverUrl: serverConfig.url,
            clientRegistration,
            tokens,
            authServerMetadata: metadata.authServer,
        };

        await updateMcpServerOAuth(name, oauthData);
        console.log(chalk.green(`\nAuthentication successful for ${name}!`));
        console.log(chalk.dim('Tokens have been stored in your config.'));
    });

mcp.command('logout <name>')
    .description('Remove OAuth credentials for an MCP server')
    .action(async (name) => {
        const config = await loadConfig();

        if (!config.mcpServers[name]) {
            console.error(chalk.red(`MCP server not found: ${name}`));
            process.exit(1);
        }

        if (!config.mcpServers[name].oauth) {
            console.log(chalk.yellow(`Server ${name} is not authenticated`));
            return;
        }

        delete config.mcpServers[name].oauth;
        await saveConfig(config);
        console.log(chalk.green(`Logged out of ${name}`));
    });

const tunnel = program
    .command('tunnel')
    .description('Manage tunnel to expose Nero to the internet');

tunnel
    .command('start', { isDefault: true })
    .description('Start a tunnel')
    .option('-n, --ngrok', 'Use ngrok (requires account)')
    .option('-c, --cloudflared', 'Use Cloudflare Tunnel (free, no account)')
    .option('-p, --port <port>', 'Local port to tunnel', '4848')
    .option('-d, --daemon', 'Run in background')
    .action(async (options) => {
        const port = options.port || '4848';
        const useNgrok = options.ngrok;
        const useCloudflared = options.cloudflared;
        const daemon = options.daemon;

        const existingState = await loadTunnelState();
        if (existingState && isProcessRunning(existingState.pid)) {
            console.log(chalk.yellow('Tunnel already running.'));
            console.log(chalk.dim(`  URL: ${existingState.url}`));
            console.log(chalk.dim(`  PID: ${existingState.pid}`));
            console.log(chalk.dim('\nRun `nero tunnel stop` to stop it.'));
            process.exit(0);
        }

        const { spawn, execSync } = await import('child_process');

        const hasCommand = (cmd: string): boolean => {
            try {
                execSync(`which ${cmd}`, { stdio: 'ignore' });
                return true;
            } catch {
                return false;
            }
        };

        let tool: 'cloudflared' | 'ngrok';

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

        const { mkdir, readFile, writeFile } = await import('fs/promises');
        const { openSync } = await import('fs');

        console.log(chalk.dim(`Starting ${tool} tunnel on port ${port}...`));

        const TUNNEL_LOG_FILE = join(homedir(), '.nero', 'tunnel.log');
        await mkdir(join(homedir(), '.nero'), { recursive: true });

        if (daemon) {
            await writeFile(TUNNEL_LOG_FILE, '');

            const logFd = openSync(TUNNEL_LOG_FILE, 'a');

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

            await saveTunnelState({
                pid: proc.pid!,
                url,
                tool,
                port,
                startedAt: new Date().toISOString(),
            });

            console.log(chalk.bold.green(`\n  Tunnel URL: ${url}`));
            console.log(chalk.dim(`  Running in background (PID: ${proc.pid})`));
            console.log(chalk.dim('  Run `nero tunnel stop` to stop.\n'));
            process.exit(0);
        } else {
            if (tool === 'cloudflared') {
                const proc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
                    stdio: ['ignore', 'pipe', 'pipe'],
                });

                let urlPrinted = false;

                const handleOutput = (data: Buffer) => {
                    const output = data.toString();
                    const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
                    if (match && !urlPrinted) {
                        urlPrinted = true;
                        console.log(chalk.bold.green(`\n  Tunnel URL: ${match[0]}`));
                        console.log(chalk.dim('  Press Ctrl+C to stop.\n'));
                    }
                };

                proc.stdout.on('data', handleOutput);
                proc.stderr.on('data', handleOutput);

                proc.on('close', (code) => {
                    if (code !== 0 && code !== null) {
                        console.error(chalk.red(`cloudflared exited with code ${code}`));
                    }
                    process.exit(code || 0);
                });

                process.on('SIGINT', () => {
                    proc.kill('SIGINT');
                });
            } else {
                const proc = spawn('ngrok', ['http', port], {
                    stdio: ['ignore', 'pipe', 'pipe'],
                });

                setTimeout(async () => {
                    try {
                        const response = await fetch('http://localhost:4040/api/tunnels');
                        const data = (await response.json()) as {
                            tunnels: Array<{ public_url: string }>;
                        };
                        const tunnelInfo = data.tunnels.find((t: { public_url: string }) =>
                            t.public_url.startsWith('https'),
                        );
                        if (tunnelInfo) {
                            console.log(
                                chalk.bold.green(`\n  Tunnel URL: ${tunnelInfo.public_url}`),
                            );
                            console.log(chalk.dim('  Press Ctrl+C to stop.\n'));
                        }
                    } catch {
                        console.log(
                            chalk.yellow('Could not fetch ngrok URL. Check http://localhost:4040'),
                        );
                    }
                }, 2000);

                proc.on('close', (code) => {
                    if (code !== 0 && code !== null) {
                        console.error(chalk.red(`ngrok exited with code ${code}`));
                    }
                    process.exit(code || 0);
                });

                process.on('SIGINT', () => {
                    proc.kill('SIGINT');
                });
            }
        }
    });

tunnel
    .command('stop')
    .description('Stop the background tunnel')
    .action(async () => {
        const state = await loadTunnelState();

        if (!state) {
            console.log(chalk.yellow('No tunnel running.'));
            process.exit(0);
        }

        if (!isProcessRunning(state.pid)) {
            console.log(chalk.yellow('Tunnel process not found (may have crashed).'));
            await clearTunnelState();
            process.exit(0);
        }

        try {
            process.kill(state.pid, 'SIGTERM');
            await clearTunnelState();
            console.log(chalk.green(`Tunnel stopped (PID: ${state.pid})`));
        } catch (error) {
            console.error(chalk.red(`Failed to stop tunnel: ${(error as Error).message}`));
            process.exit(1);
        }
    });

tunnel
    .command('status')
    .description('Show tunnel status')
    .action(async () => {
        const state = await loadTunnelState();

        if (!state) {
            console.log(chalk.yellow('No tunnel configured.'));
            console.log(chalk.dim('\nStart one with: nero tunnel -d'));
            process.exit(0);
        }

        const running = isProcessRunning(state.pid);

        console.log(chalk.bold('\nTunnel Status:\n'));
        console.log(`  Status: ${running ? chalk.green('running') : chalk.red('stopped')}`);
        console.log(`  URL: ${chalk.cyan(state.url)}`);
        console.log(`  Tool: ${state.tool}`);
        console.log(`  Port: ${state.port}`);
        console.log(`  PID: ${state.pid}`);
        console.log(`  Started: ${new Date(state.startedAt).toLocaleString()}`);
        console.log();

        if (!running) {
            await clearTunnelState();
            console.log(chalk.dim('Tunnel state cleared. Start a new one with: nero tunnel -d'));
        }
    });

const license = program
    .command('license')
    .description('Manage Nero license for voice/SMS features');

const BACKEND_API = process.env.BACKEND_URL || 'https://api.magmadeploy.com';

license
    .command('register')
    .description('Register your tunnel URL with your license key')
    .option('-k, --key <key>', 'License key (or set NERO_LICENSE_KEY env var)')
    .option('-u, --url <url>', 'Tunnel URL (auto-detected from running tunnel if not provided)')
    .action(async (options) => {
        const config = await loadConfig();
        const licenseKey = options.key || config.licenseKey || process.env.NERO_LICENSE_KEY;

        if (!licenseKey) {
            console.error(chalk.red('No license key found.'));
            console.log(chalk.dim('\nProvide via:'));
            console.log(chalk.dim('  --key <key>'));
            console.log(chalk.dim('  NERO_LICENSE_KEY env var'));
            console.log(chalk.dim('  licenseKey in ~/.nero/config.json'));
            process.exit(1);
        }

        let tunnelUrl = options.url;

        if (!tunnelUrl) {
            const tunnelState = await loadTunnelState();
            if (tunnelState && isProcessRunning(tunnelState.pid)) {
                tunnelUrl = tunnelState.url;
                console.log(chalk.dim(`Using tunnel URL: ${tunnelUrl}`));
            } else {
                console.error(chalk.red('No tunnel URL provided and no tunnel running.'));
                console.log(chalk.dim('\nStart a tunnel first:'));
                console.log(chalk.dim('  nero tunnel -d'));
                console.log(chalk.dim('\nOr provide URL manually:'));
                console.log(chalk.dim('  nero license register --url https://your-tunnel.com'));
                process.exit(1);
            }
        }

        console.log(chalk.dim('Registering with Pompeii...'));

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

            console.log(chalk.green('\nLicense registered successfully!'));
            console.log(chalk.dim(`  Tunnel URL: ${tunnelUrl}`));
            console.log(chalk.dim('\nYour Nero instance is now configured for voice/SMS.'));
        } catch (error) {
            console.error(chalk.red(`Registration failed: ${(error as Error).message}`));
            process.exit(1);
        }
    });

license
    .command('status')
    .description('Check license status')
    .option('-k, --key <key>', 'License key (or set NERO_LICENSE_KEY env var)')
    .action(async (options) => {
        const config = await loadConfig();
        const licenseKey = options.key || config.licenseKey || process.env.NERO_LICENSE_KEY;

        if (!licenseKey) {
            console.error(chalk.red('No license key found.'));
            process.exit(1);
        }

        try {
            const response = await fetch(`${BACKEND_API}/v1/license/verify`, {
                method: 'GET',
                headers: {
                    'x-license-key': licenseKey,
                },
            });

            if (!response.ok) {
                if (response.status === 401) {
                    console.log(chalk.red('Invalid license key.'));
                } else {
                    console.log(chalk.red('Failed to verify license.'));
                }
                process.exit(1);
            }

            const data = (await response.json()) as {
                valid: boolean;
                active: boolean;
                tunnel_url: string | null;
            };

            console.log(chalk.bold('\nLicense Status:\n'));
            console.log(`  Valid: ${data.valid ? chalk.green('yes') : chalk.red('no')}`);
            console.log(`  Active: ${data.active ? chalk.green('yes') : chalk.red('no')}`);
            console.log(
                `  Tunnel URL: ${data.tunnel_url ? chalk.cyan(data.tunnel_url) : chalk.dim('not registered')}`,
            );
            console.log();
        } catch (error) {
            console.error(chalk.red(`Status check failed: ${(error as Error).message}`));
            process.exit(1);
        }
    });

mcp.command('status [name]')
    .description('Show authentication status of MCP servers')
    .action(async (name) => {
        const config = await loadConfig();

        if (name) {
            if (!config.mcpServers[name]) {
                console.error(chalk.red(`MCP server not found: ${name}`));
                process.exit(1);
            }

            const server = config.mcpServers[name];
            console.log(chalk.bold(`\n${name}:`));

            if (server.transport !== 'http') {
                console.log(chalk.dim('  Transport: stdio (no auth required)'));
                return;
            }

            console.log(chalk.dim(`  URL: ${server.url}`));

            if (server.oauth?.tokens) {
                console.log(chalk.green('  Status: Authenticated'));
                if (server.oauth.tokens.issued_at && server.oauth.tokens.expires_in) {
                    const expiresAt = new Date(
                        server.oauth.tokens.issued_at + server.oauth.tokens.expires_in * 1000,
                    );
                    console.log(chalk.dim(`  Token expires: ${expiresAt.toLocaleString()}`));
                }
            } else {
                console.log(chalk.yellow('  Status: Not authenticated'));

                const metadata = await discoverOAuthMetadata(server.url!);
                if (metadata?.authServer) {
                    console.log(chalk.dim(`  OAuth available: yes`));
                    console.log(chalk.dim(`  Run: nero mcp auth ${name}`));
                } else {
                    console.log(chalk.dim(`  OAuth available: no`));
                }
            }
        } else {
            const servers = Object.entries(config.mcpServers);
            if (servers.length === 0) {
                console.log(chalk.yellow('No MCP servers configured.'));
                return;
            }

            console.log(chalk.bold('\nMCP Server Authentication Status:\n'));
            for (const [serverName, server] of servers) {
                const transport = server.transport || 'stdio';
                if (transport !== 'http') {
                    console.log(`  ${chalk.cyan(serverName)} ${chalk.dim('(stdio)')}`);
                    continue;
                }

                const isAuth = !!server.oauth?.tokens;
                const status = isAuth
                    ? chalk.green('authenticated')
                    : chalk.yellow('not authenticated');
                console.log(`  ${chalk.cyan(serverName)} ${chalk.dim('(http)')} - ${status}`);
            }
            console.log();
        }
    });

program
    .command('update')
    .description('Update Nero to the latest version')
    .option('--check', 'Check for updates without installing')
    .action(async (options) => {
        const { execSync, spawn } = await import('child_process');

        const REPO = 'pompeii-labs/nero-oss';

        console.log(chalk.dim('Checking for updates...'));

        try {
            const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
            const data = await response.json();
            const latestTag = data.tag_name;
            const latestVersion = latestTag?.replace(/^v/, '');

            console.log(`Current: ${chalk.cyan(VERSION)}`);
            console.log(`Latest:  ${chalk.cyan(latestVersion)}`);

            if (!semver.gt(latestVersion, VERSION)) {
                console.log(chalk.green('\nYou are on the latest version!'));
                process.exit(0);
            }

            if (options.check) {
                console.log(
                    chalk.yellow(
                        `\nUpdate available! Run ${chalk.cyan('nero update')} to install.`,
                    ),
                );
                process.exit(0);
            }

            console.log(chalk.dim('\nUpdating...'));

            const isDockerCompose = await import('fs').then((fs) =>
                fs.existsSync(join(homedir(), '.nero', 'docker-compose.yml')),
            );

            if (isDockerCompose) {
                console.log(chalk.dim('Detected Docker Compose installation'));
                const neroDir = join(homedir(), '.nero');

                const hasComposeV2 = (() => {
                    try {
                        execSync('docker compose version', { stdio: 'ignore' });
                        return true;
                    } catch {
                        return false;
                    }
                })();

                const compose = hasComposeV2 ? 'docker compose' : 'docker-compose';

                console.log(chalk.dim('Pulling latest image...'));
                execSync(`${compose} pull`, { cwd: neroDir, stdio: 'inherit' });

                console.log(chalk.dim('Restarting containers...'));
                execSync(`${compose} down`, { cwd: neroDir, stdio: 'inherit' });
                execSync(`${compose} up -d`, { cwd: neroDir, stdio: 'inherit' });

                console.log(chalk.green('\nDocker containers updated!'));
            }

            console.log(chalk.dim('\nUpdating CLI binary...'));

            const os = (await import('os')).default;
            const platform = os.platform();
            const arch = os.arch();

            const osName = platform === 'darwin' ? 'darwin' : 'linux';
            const archName = arch === 'arm64' ? 'arm64' : 'x64';
            const binary = `nero-${osName}-${archName}`;

            const binaryUrl = `https://github.com/${REPO}/releases/download/${latestTag}/${binary}`;

            console.log(chalk.dim(`Downloading ${binary}...`));
            execSync(
                `curl -fsSL "${binaryUrl}" -o /tmp/nero && chmod +x /tmp/nero && sudo mv /tmp/nero /usr/local/bin/nero`,
                {
                    stdio: 'inherit',
                },
            );

            console.log(chalk.green(`\nNero updated to ${latestVersion}!`));
        } catch (error) {
            const err = error as Error;
            console.error(chalk.red(`Update failed: ${err.message}`));
            process.exit(1);
        }
    });

async function main() {
    try {
        await program.parseAsync(process.argv);
    } catch (error) {
        const err = error as Error;
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
    }
}

main();
