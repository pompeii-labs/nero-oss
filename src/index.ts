#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import dotenv from 'dotenv';
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

dotenv.config();

const program = new Command();

program
    .name('nero')
    .description('Open source AI companion')
    .version('0.1.0');

program
    .command('chat', { isDefault: true })
    .description('Start interactive chat session')
    .option('-m, --message <message>', 'Send a single message and exit')
    .action(async (options) => {
        const config = await loadConfig();

        if (options.message) {
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

            const client = new NeroClient({ baseUrl: serviceUrl });

            try {
                await client.chat(options.message, (chunk) => {
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

        const serviceUrl = process.env.NERO_SERVICE_URL || 'http://localhost:4848';
        const serviceRunning = await NeroClient.checkServiceRunning(serviceUrl);

        if (!serviceRunning) {
            console.error(chalk.red('Nero service not running'));
            console.log(chalk.dim('\nStart the service with:'));
            console.log(chalk.cyan('  docker-compose up -d\n'));
            process.exit(1);
        }

        console.log(chalk.dim('Reloading service configuration...'));
        const client = new NeroClient({ baseUrl: serviceUrl });

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
        console.log(`  Streaming: ${config.settings.streaming ? chalk.green('on') : chalk.yellow('off')}`);
        console.log(`  Model: ${chalk.cyan(config.settings.model)}`);
        console.log(`  Verbose: ${config.settings.verbose ? chalk.green('on') : chalk.yellow('off')}`);

        console.log(chalk.dim('\nMCP Servers:'));
        const servers = Object.keys(config.mcpServers || {});
        if (servers.length === 0) {
            console.log(chalk.yellow('  No MCP servers configured'));
        } else {
            servers.forEach(name => {
                console.log(chalk.green(`  - ${name}`));
            });
        }

        console.log(chalk.dim('\nFeatures:'));
        console.log(`  Voice: ${config.voice?.enabled ? chalk.green('enabled') : chalk.dim('disabled')}`);
        console.log(`  SMS: ${config.sms?.enabled ? chalk.green('enabled') : chalk.dim('disabled')}`);
        console.log(`  License Key: ${config.licenseKey ? chalk.green('configured') : chalk.dim('not set')}`);

        console.log(chalk.dim('\nConfig Path:'));
        console.log(`  ${getConfigPath()}`);
        console.log();
    });

const mcp = program
    .command('mcp')
    .description('Manage MCP servers');

mcp
    .command('add <name> [url]')
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

mcp
    .command('list')
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
                console.log(chalk.dim(`    Command: ${server.command} ${(server.args || []).join(' ')}`));
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

mcp
    .command('remove <name>')
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

mcp
    .command('auth <name>')
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
                redirectUri
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
                    res.end('<html><body><h1>Authentication Successful</h1><p>You can close this window.</p></body></html>');
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
                console.log(chalk.dim(`Waiting for OAuth callback on port ${port}...`));
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

mcp
    .command('logout <name>')
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

mcp
    .command('status [name]')
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
                    const expiresAt = new Date(server.oauth.tokens.issued_at + server.oauth.tokens.expires_in * 1000);
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
                const status = isAuth ? chalk.green('authenticated') : chalk.yellow('not authenticated');
                console.log(`  ${chalk.cyan(serverName)} ${chalk.dim('(http)')} - ${status}`);
            }
            console.log();
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
