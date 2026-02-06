import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { NeroClient } from '../client/index.js';
import { migrateDb } from '../db/index.js';
import { openBrowser } from '../mcp/oauth.js';

export function registerServiceCommands(program: Command) {
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
        .command('restart')
        .description('Restart the Nero service (container will restart)')
        .action(async () => {
            const config = await loadConfig();

            const serviceUrl = process.env.NERO_SERVICE_URL || 'http://localhost:4848';
            const serviceRunning = await NeroClient.checkServiceRunning(serviceUrl);

            if (!serviceRunning) {
                console.error(chalk.red('Nero service not running'));
                console.log(chalk.dim('\nStart the service with:'));
                console.log(chalk.cyan('  docker-compose up -d\n'));
                process.exit(1);
            }

            console.log(chalk.dim('Restarting service...'));
            const client = new NeroClient({ baseUrl: serviceUrl, licenseKey: config.licenseKey });

            try {
                await client.restart();
                console.log(chalk.green('Restart initiated'));
                console.log(chalk.dim('Container will restart momentarily'));
            } catch (error) {
                const err = error as Error;
                console.error(chalk.red(`Restart failed: ${err.message}`));
                process.exit(1);
            }

            process.exit(0);
        });
}
