import chalk from 'chalk';
import { NERO_BLUE } from './theme.js';
import { createServer } from 'http';
import { NeroConfig, updateSettings, getConfigPath, saveConfig, updateMcpServerOAuth } from '../config.js';
import type { NeroProxy } from '../client/proxy.js';
import {
    discoverOAuthMetadata,
    registerClient,
    buildAuthorizationUrl,
    exchangeCodeForTokens,
    openBrowser,
    type StoredOAuthData,
} from '../mcp/oauth.js';

export interface SlashCommand {
    name: string;
    aliases: string[];
    description: string;
    execute: (args: string[], ctx: CommandContext) => Promise<CommandResult>;
}

export interface CommandContext {
    nero: NeroProxy;
    config: NeroConfig;
    clearScreen: () => void;
    exit: () => void;
    log: (message: string) => void;
    setLoading: (message: string | null) => void;
}

export interface CommandResult {
    message?: string;
    error?: string;
    shouldContinue?: boolean;
}

async function validateModel(modelId: string): Promise<boolean> {
    try {
        const response = await fetch(`https://openrouter.ai/api/v1/models/${modelId}/endpoints`, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            },
        });
        return response.ok;
    } catch {
        return true;
    }
}

export const commands: SlashCommand[] = [
    {
        name: 'help',
        aliases: ['h', '?'],
        description: 'Show available commands',
        execute: async () => {
            const helpText = commands
                .map(cmd => {
                    const aliases = cmd.aliases.length > 0 ? ` (${cmd.aliases.join(', ')})` : '';
                    return `  /${cmd.name}${aliases} - ${cmd.description}`;
                })
                .join('\n');
            return { message: `\n${chalk.bold('Available Commands:')}\n\n${helpText}\n` };
        },
    },
    {
        name: 'exit',
        aliases: ['quit', 'q'],
        description: 'Exit Nero',
        execute: async (_, ctx) => {
            ctx.log(chalk.dim('Goodbye.'));
            setTimeout(() => {
                ctx.exit();
                process.exit(0);
            }, 100);
            return { shouldContinue: false };
        },
    },
    {
        name: 'clear',
        aliases: ['c'],
        description: 'Clear current session (use --confirm to skip prompt)',
        execute: async (args, ctx) => {
            if (!args.includes('--confirm')) {
                return {
                    message: chalk.yellow('This will clear your current conversation.\n') +
                             chalk.dim('Run /clear --confirm to proceed.')
                };
            }
            ctx.nero.clearHistory();
            ctx.clearScreen();
            return { message: chalk.dim('Conversation cleared.') };
        },
    },
    {
        name: 'streaming',
        aliases: ['stream'],
        description: 'Toggle streaming output on/off',
        execute: async (args, ctx) => {
            const current = ctx.config.settings.streaming;
            const newValue = args[0] === 'on' ? true : args[0] === 'off' ? false : !current;
            await updateSettings({ streaming: newValue });
            ctx.config.settings.streaming = newValue;
            return {
                message: `Streaming ${newValue ? chalk.green('enabled') : chalk.dim('disabled')}`,
            };
        },
    },
    {
        name: 'model',
        aliases: ['m'],
        description: 'Show or change the current model',
        execute: async (args, ctx) => {
            if (args.length === 0) {
                return { message: `Current model: ${chalk.cyan(ctx.config.settings.model)}` };
            }
            const newModel = args.join('/');

            ctx.log(chalk.dim(`Validating model ${newModel}...`));
            const isValid = await validateModel(newModel);
            if (!isValid) {
                return { error: `Model not found: ${newModel}. Check available models at https://openrouter.ai/models` };
            }

            await updateSettings({ model: newModel });
            ctx.config.settings.model = newModel;
            ctx.nero.setModel(newModel);
            return { message: `Model changed to ${chalk.cyan(newModel)}` };
        },
    },
    {
        name: 'verbose',
        aliases: ['v'],
        description: 'Toggle verbose logging',
        execute: async (_, ctx) => {
            const newValue = !ctx.config.settings.verbose;
            await updateSettings({ verbose: newValue });
            ctx.config.settings.verbose = newValue;
            return {
                message: `Verbose mode ${newValue ? chalk.green('enabled') : chalk.dim('disabled')}`,
            };
        },
    },
    {
        name: 'memory',
        aliases: ['mem'],
        description: 'Show stored memories',
        execute: async (_, ctx) => {
            const memories = await ctx.nero.getMemories();
            if (memories.length === 0) {
                return { message: chalk.dim('No memories stored yet.') };
            }
            const list = memories
                .map((m, i) => `  ${chalk.dim(`${i + 1}.`)} ${m.body}\n      ${chalk.dim(m.created_at)}`)
                .join('\n');
            return { message: `\n${chalk.bold('Memories:')}\n\n${list}\n` };
        },
    },
    {
        name: 'actions',
        aliases: ['a'],
        description: 'Show scheduled actions',
        execute: async (_, ctx) => {
            const actions = await ctx.nero.getActions();
            if (actions.length === 0) {
                return { message: chalk.dim('No scheduled actions.') };
            }
            const list = actions
                .map((a, i) => `  ${chalk.dim(`${i + 1}.`)} ${a.request}\n      ${chalk.dim(`Next: ${a.timestamp}`)}`)
                .join('\n');
            return { message: `\n${chalk.bold('Scheduled Actions:')}\n\n${list}\n` };
        },
    },
    {
        name: 'tools',
        aliases: ['t'],
        description: 'List available MCP tools',
        execute: async (_, ctx) => {
            const tools = ctx.nero.getMcpToolNames();
            if (tools.length === 0) {
                return { message: chalk.dim('No MCP tools configured. Add servers to .nero/config.json') };
            }
            const list = tools.map(t => `  ${chalk.cyan(t)}`).join('\n');
            return { message: `\n${chalk.bold('Available MCP Tools:')}\n\n${list}\n` };
        },
    },
    {
        name: 'config',
        aliases: ['settings'],
        description: 'Show current configuration',
        execute: async (_, ctx) => {
            const settings = ctx.config.settings;
            const mcpCount = Object.keys(ctx.config.mcpServers).length;

            let output = `\n${chalk.bold('Settings:')}\n`;
            output += `  Streaming: ${settings.streaming ? chalk.green('on') : chalk.dim('off')}\n`;
            output += `  Model: ${chalk.cyan(settings.model)}\n`;
            output += `  Verbose: ${settings.verbose ? chalk.green('on') : chalk.dim('off')}\n`;
            output += `  MCP Servers: ${mcpCount > 0 ? chalk.green(mcpCount) : chalk.dim('none')}\n`;
            output += `  Config Path: ${chalk.dim(getConfigPath())}\n`;

            return { message: output };
        },
    },
    {
        name: 'mcp',
        aliases: [],
        description: 'Manage MCP servers (auth|enable|disable|logout|status)',
        execute: async (args, ctx) => {
            const subcommand = args[0];
            const serverName = args[1];

            if (subcommand === 'auth') {
                if (!serverName) {
                    return { error: 'Usage: /mcp auth <server-name>' };
                }
                return await handleMcpAuth(serverName, ctx);
            }

            if (subcommand === 'enable') {
                if (!serverName) {
                    return { error: 'Usage: /mcp enable <server-name>' };
                }
                return await handleMcpEnable(serverName, ctx);
            }

            if (subcommand === 'disable') {
                if (!serverName) {
                    return { error: 'Usage: /mcp disable <server-name>' };
                }
                return await handleMcpDisable(serverName, ctx);
            }

            if (subcommand === 'logout') {
                if (!serverName) {
                    return { error: 'Usage: /mcp logout <server-name>' };
                }
                return await handleMcpLogout(serverName, ctx);
            }

            const servers = Object.entries(ctx.config.mcpServers);

            if (servers.length === 0) {
                let output = chalk.cyan('No MCP servers configured.\n\n');
                output += chalk.dim('Add one with:\n');
                output += chalk.cyan('  nero mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem ~/Documents\n');
                output += chalk.cyan('  nero mcp add github -e GITHUB_TOKEN=xxx -- npx -y @modelcontextprotocol/server-github\n');
                return { message: output };
            }

            const tools = ctx.nero.getMcpToolNames();
            const connectedServers = new Set(tools.map(t => t.split(':')[0]));

            let output = `\n${chalk.bold('MCP Servers:')}\n\n`;
            for (const [name, config] of servers) {
                const isDisabled = config.disabled;
                const isConnected = connectedServers.has(name);
                const transport = config.transport || (config.url ? 'http' : 'stdio');

                let statusIcon: string;
                let statusText: string;

                if (isDisabled) {
                    statusIcon = chalk.dim('○');
                    statusText = chalk.dim('disabled');
                } else if (isConnected) {
                    statusIcon = chalk.green('●');
                    statusText = chalk.green('connected');
                } else {
                    statusIcon = chalk.cyan('○');
                    statusText = chalk.cyan('disconnected');
                }

                output += `  ${statusIcon} ${chalk.bold(name)} ${chalk.dim(`(${transport}, ${statusText})`)}\n`;

                if (config.url) {
                    output += `    ${chalk.dim('URL:')} ${config.url}\n`;
                } else if (config.command) {
                    output += `    ${chalk.dim('Command:')} ${config.command} ${(config.args || []).join(' ')}\n`;
                }

                if (config.env) {
                    const envKeys = Object.keys(config.env);
                    const hasValues = envKeys.every(k => config.env![k] && config.env![k] !== '');
                    if (hasValues) {
                        output += `    ${chalk.dim('Env:')} ${envKeys.join(', ')} ${chalk.green('✓')}\n`;
                    } else {
                        output += `    ${chalk.dim('Env:')} ${envKeys.join(', ')} ${chalk.red('(needs configuration)')}\n`;
                    }
                }

                if (config.headers) {
                    output += `    ${chalk.dim('Headers:')} ${Object.keys(config.headers).join(', ')}\n`;
                }

                if (transport === 'http') {
                    if (config.oauth?.tokens) {
                        output += `    ${chalk.dim('Auth:')} ${chalk.green('authenticated')} ${chalk.dim('(/mcp logout ' + name + ')')}\n`;
                    } else {
                        output += `    ${chalk.dim('Auth:')} ${chalk.cyan('not authenticated')} ${chalk.dim('(/mcp auth ' + name + ')')}\n`;
                    }
                }

                if (isDisabled) {
                    output += `    ${chalk.dim('Action:')} ${chalk.cyan('/mcp enable ' + name)}\n`;
                } else {
                    output += `    ${chalk.dim('Action:')} ${chalk.cyan('/mcp disable ' + name)}\n`;
                }
            }

            if (tools.length > 0) {
                output += `\n${chalk.bold('Available Tools:')} ${chalk.dim(`(${tools.length})`)}\n`;
                const grouped: Record<string, string[]> = {};
                for (const t of tools) {
                    const [server, tool] = t.split(':');
                    if (!grouped[server]) grouped[server] = [];
                    grouped[server].push(tool);
                }
                for (const [server, serverTools] of Object.entries(grouped)) {
                    output += `  ${chalk.cyan(server)}: ${serverTools.join(', ')}\n`;
                }
            }

            output += `\n${chalk.dim('Commands: /mcp auth|enable|disable|logout <server>')}\n`;
            output += `${chalk.dim('CLI: nero mcp add|list|remove')}\n`;
            return { message: output };
        },
    },
    {
        name: 'compact',
        aliases: [],
        description: 'Summarize conversation to reduce context',
        execute: async (_, ctx) => {
            ctx.setLoading('Compacting conversation');

            try {
                const summary = await ctx.nero.performCompaction();
                ctx.setLoading(null);
                ctx.clearScreen();
                return {
                    message: chalk.green('Conversation compacted.\n\n') +
                             chalk.dim('Summary: ') + summary
                };
            } catch (error) {
                ctx.setLoading(null);
                const err = error as Error;
                return { error: `Failed to compact: ${err.message}` };
            }
        },
    },
    {
        name: 'history',
        aliases: ['hist'],
        description: 'Show recent message history',
        execute: async (args, ctx) => {
            const limit = args[0] ? parseInt(args[0], 10) : 20;

            if (isNaN(limit) || limit < 1 || limit > 100) {
                return { error: 'Please provide a number between 1 and 100' };
            }

            const messages = await ctx.nero.getMessageHistory(limit);

            if (messages.length === 0) {
                return { message: chalk.dim('No message history found.') };
            }

            let output = `\n${chalk.bold('Message History')} ${chalk.dim(`(last ${messages.length})`)}\n\n`;

            for (const msg of messages) {
                const role = msg.role === 'user' ? chalk.cyan('you') : chalk.blue('nero');
                const time = new Date(msg.created_at).toLocaleTimeString();
                const preview = msg.content.length > 60
                    ? msg.content.slice(0, 60) + '...'
                    : msg.content;
                output += `  ${chalk.dim(time)} ${role}: ${preview}\n`;
            }

            return { message: output };
        },
    },
    {
        name: 'context',
        aliases: ['ctx'],
        description: 'Show context usage (tokens, % of limit)',
        execute: async (_, ctx) => {
            const usage = ctx.nero.getContextUsage();

            let bar = '';
            const filled = Math.round(usage.percentage / 5);
            for (let i = 0; i < 20; i++) {
                bar += i < filled ? '=' : '-';
            }

            const color = usage.percentage > 80 ? chalk.red :
                          usage.percentage > 60 ? chalk.hex(NERO_BLUE) :
                          chalk.green;

            let output = `\n${chalk.bold('Context Usage')}\n\n`;
            output += `  Tokens: ${chalk.cyan(usage.tokens.toLocaleString())} / ${usage.limit.toLocaleString()}\n`;
            output += `  Usage:  [${color(bar)}] ${color(usage.percentage + '%')}\n`;

            if (usage.percentage > 70) {
                output += `\n  ${chalk.yellow('Tip:')} Run /compact to reduce context usage\n`;
            }

            return { message: output };
        },
    },
    {
        name: 'install-slack',
        aliases: ['slack'],
        description: 'Connect Nero to Slack for DM conversations',
        execute: async (_, ctx) => {
            if (!ctx.config.licenseKey) {
                return {
                    error: 'License key required for Slack integration.\n' +
                           chalk.dim('Get one at https://nero.pompeiilabs.com'),
                };
            }

            ctx.setLoading('Getting Slack install URL');

            try {
                const apiUrl = process.env.POMPEII_API_URL || 'https://api.magmadeploy.com';
                const response = await fetch(`${apiUrl}/v1/nero/slack/install`, {
                    headers: {
                        'x-license-key': ctx.config.licenseKey,
                    },
                });

                if (!response.ok) {
                    ctx.setLoading(null);
                    const data = await response.json().catch(() => ({}));
                    return { error: data.error || `Failed to get install URL: ${response.status}` };
                }

                const { url } = await response.json();
                ctx.setLoading(null);

                ctx.log(chalk.blue('\nOpening browser to connect Slack...'));
                ctx.log(chalk.dim(`If the browser doesn't open, visit:\n${url}\n`));

                openBrowser(url);

                return {
                    message: chalk.green('Complete the authorization in your browser.\n') +
                             chalk.dim('Once done, you can DM Nero directly in Slack!'),
                };
            } catch (error) {
                ctx.setLoading(null);
                const err = error as Error;
                return { error: `Failed to start Slack install: ${err.message}` };
            }
        },
    },
    {
        name: 'usage',
        aliases: ['credits', 'balance'],
        description: 'Show OpenRouter API usage and credits',
        execute: async (_, ctx) => {
            ctx.setLoading('Fetching usage data');

            try {
                const apiKey = process.env.OPENROUTER_API_KEY;
                if (!apiKey) {
                    ctx.setLoading(null);
                    return { error: 'OPENROUTER_API_KEY not set' };
                }

                const response = await fetch('https://openrouter.ai/api/v1/key', {
                    headers: { 'Authorization': `Bearer ${apiKey}` },
                });

                if (!response.ok) {
                    ctx.setLoading(null);
                    return { error: `Failed to fetch usage: ${response.status}` };
                }

                const data = await response.json();
                const { limit, usage, limit_remaining } = data.data;

                const hasLimit = limit !== null && limit > 0;
                const totalUsage = usage || 0;
                const remaining = limit_remaining ?? 0;
                const usagePercent = hasLimit ? Math.round((totalUsage / limit) * 100) : 0;

                ctx.setLoading(null);

                let output = `\n${chalk.bold('OpenRouter Usage')}\n\n`;

                if (hasLimit) {
                    let bar = '';
                    const filled = Math.round(usagePercent / 5);
                    for (let i = 0; i < 20; i++) {
                        bar += i < filled ? '=' : '-';
                    }

                    const color = usagePercent > 90 ? chalk.red :
                                  usagePercent > 70 ? chalk.hex(NERO_BLUE) :
                                  chalk.green;

                    const remainingColor = remaining < 1 ? chalk.red :
                                           remaining < 5 ? chalk.hex(NERO_BLUE) :
                                           chalk.green;

                    output += `  Limit:     $${limit.toFixed(2)}\n`;
                    output += `  Used:      $${totalUsage.toFixed(2)}\n`;
                    output += `  Remaining: ${remainingColor('$' + remaining.toFixed(2))}\n\n`;
                    output += `  Usage: [${color(bar)}] ${color(usagePercent + '%')}\n`;

                    if (remaining < 1) {
                        output += `\n  ${chalk.red('Warning:')} Low balance! Top up at openrouter.ai/credits\n`;
                    }
                } else {
                    output += `  Used: $${totalUsage.toFixed(2)}\n`;
                    output += `  ${chalk.dim('No spending limit set')}\n`;
                }

                if (data.data.usage_monthly !== undefined) {
                    output += `\n${chalk.bold('This Month')}\n`;
                    output += `  Usage: $${(data.data.usage_monthly || 0).toFixed(2)}\n`;
                }

                if (data.data.rate_limit) {
                    output += `\n${chalk.bold('Rate Limit')}\n`;
                    output += `  ${chalk.dim(data.data.rate_limit.requests + ' requests / ' + data.data.rate_limit.interval)}\n`;
                }

                return { message: output };
            } catch (error) {
                ctx.setLoading(null);
                const err = error as Error;
                return { error: `Failed to fetch usage: ${err.message}` };
            }
        },
    },
];

async function handleMcpAuth(serverName: string, ctx: CommandContext): Promise<CommandResult> {
    const serverConfig = ctx.config.mcpServers[serverName];

    if (!serverConfig) {
        return { error: `MCP server not found: ${serverName}` };
    }

    if (serverConfig.transport !== 'http' || !serverConfig.url) {
        return { error: `Server ${serverName} is not an HTTP MCP server` };
    }

    if (serverConfig.oauth?.tokens) {
        return { message: chalk.cyan(`Server ${serverName} is already authenticated. Use /mcp logout ${serverName} first.`) };
    }

    ctx.log(chalk.dim(`Discovering OAuth metadata for ${serverName}...`));
    const metadata = await discoverOAuthMetadata(serverConfig.url);

    if (!metadata?.authServer) {
        return { error: `Server ${serverName} does not support OAuth authentication` };
    }

    ctx.log(chalk.dim(`Found authorization server: ${metadata.authServer.issuer}`));

    const port = 8976;
    const redirectUri = `http://localhost:${port}/callback`;

    let clientRegistration = serverConfig.oauth?.clientRegistration;
    if (!clientRegistration) {
        ctx.log(chalk.dim('Registering client...'));
        clientRegistration = await registerClient(
            metadata.authServer,
            `nero-${serverName}`,
            redirectUri
        );

        if (!clientRegistration) {
            return { error: 'Failed to register OAuth client' };
        }
        ctx.log(chalk.dim(`Client registered: ${clientRegistration.client_id}`));
    }

    const { codeVerifier, state, authUrl } = buildAuthorizationUrl({
        authServerMetadata: metadata.authServer,
        clientId: clientRegistration.client_id,
        redirectUri,
    });

    ctx.log(chalk.blue('\nOpening browser for authentication...'));
    ctx.log(chalk.dim(`If the browser doesn't open, visit:\n${authUrl}\n`));

    openBrowser(authUrl);

    try {
        const tokens = await new Promise<Awaited<ReturnType<typeof exchangeCodeForTokens>>>((resolve, reject) => {
            const server = createServer(async (req, res) => {
                const url = new URL(req.url || '', `http://localhost:${port}`);

                if (url.pathname === '/callback') {
                    const code = url.searchParams.get('code');
                    const returnedState = url.searchParams.get('state');
                    const error = url.searchParams.get('error');

                    if (error) {
                        res.writeHead(400, { 'Content-Type': 'text/html' });
                        res.end(`<html><body><h1>Authentication Failed</h1><p>${error}</p></body></html>`);
                        server.close();
                        reject(new Error(`OAuth error: ${error}`));
                        return;
                    }

                    if (!code || returnedState !== state) {
                        res.writeHead(400, { 'Content-Type': 'text/html' });
                        res.end('<html><body><h1>Invalid Response</h1><p>Missing code or state mismatch</p></body></html>');
                        server.close();
                        reject(new Error('Invalid OAuth response'));
                        return;
                    }

                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end('<html><body><h1>Authentication Successful</h1><p>You can close this window and return to Nero.</p></body></html>');
                    server.close();

                    const tokens = await exchangeCodeForTokens(
                        metadata.authServer!,
                        clientRegistration!.client_id,
                        code,
                        codeVerifier,
                        redirectUri
                    );
                    resolve(tokens);
                } else {
                    res.writeHead(404);
                    res.end('Not found');
                }
            });

            server.listen(port, () => {
                ctx.log(chalk.dim(`Waiting for OAuth callback on port ${port}...`));
            });

            server.on('error', (err) => {
                reject(err);
            });

            setTimeout(() => {
                server.close();
                reject(new Error('OAuth timeout - no callback received within 5 minutes'));
            }, 5 * 60 * 1000);
        });

        if (!tokens) {
            return { error: 'Failed to obtain access token' };
        }

        const oauthData: StoredOAuthData = {
            serverUrl: serverConfig.url,
            clientRegistration,
            tokens,
            authServerMetadata: metadata.authServer,
        };

        await updateMcpServerOAuth(serverName, oauthData);
        ctx.config.mcpServers[serverName].oauth = oauthData;

        return { message: chalk.green(`\nAuthentication successful for ${serverName}! Restart Nero to connect.`) };
    } catch (error) {
        const err = error as Error;
        return { error: `Authentication failed: ${err.message}` };
    }
}

async function handleMcpEnable(serverName: string, ctx: CommandContext): Promise<CommandResult> {
    const serverConfig = ctx.config.mcpServers[serverName];

    if (!serverConfig) {
        return { error: `MCP server not found: ${serverName}` };
    }

    if (!serverConfig.disabled) {
        return { message: chalk.cyan(`Server ${serverName} is already enabled.`) };
    }

    delete ctx.config.mcpServers[serverName].disabled;
    await saveConfig(ctx.config);

    return { message: chalk.green(`Server ${serverName} enabled. Restart Nero to connect.`) };
}

async function handleMcpDisable(serverName: string, ctx: CommandContext): Promise<CommandResult> {
    const serverConfig = ctx.config.mcpServers[serverName];

    if (!serverConfig) {
        return { error: `MCP server not found: ${serverName}` };
    }

    if (serverConfig.disabled) {
        return { message: chalk.cyan(`Server ${serverName} is already disabled.`) };
    }

    ctx.config.mcpServers[serverName].disabled = true;
    await saveConfig(ctx.config);

    return { message: chalk.green(`Server ${serverName} disabled. It will not connect on next restart.`) };
}

async function handleMcpLogout(serverName: string, ctx: CommandContext): Promise<CommandResult> {
    const serverConfig = ctx.config.mcpServers[serverName];

    if (!serverConfig) {
        return { error: `MCP server not found: ${serverName}` };
    }

    if (!serverConfig.oauth) {
        return { message: chalk.cyan(`Server ${serverName} is not authenticated.`) };
    }

    delete ctx.config.mcpServers[serverName].oauth;
    await saveConfig(ctx.config);

    return { message: chalk.green(`Logged out of ${serverName}.`) };
}

export function findCommand(input: string): SlashCommand | null {
    const name = input.toLowerCase();
    return commands.find(cmd => cmd.name === name || cmd.aliases.includes(name)) || null;
}

export function getCommandSuggestions(partial: string): SlashCommand[] {
    const lower = partial.toLowerCase();
    return commands.filter(
        cmd => cmd.name.startsWith(lower) || cmd.aliases.some(a => a.startsWith(lower))
    );
}

export async function executeCommand(
    input: string,
    ctx: CommandContext
): Promise<CommandResult> {
    const parts = input.slice(1).split(/\s+/);
    const cmdName = parts[0];
    const args = parts.slice(1);

    const command = findCommand(cmdName);
    if (!command) {
        return { error: `Unknown command: ${cmdName}. Type /help for available commands.` };
    }

    try {
        return await command.execute(args, ctx);
    } catch (error) {
        const err = error as Error;
        return { error: `Command failed: ${err.message}` };
    }
}
