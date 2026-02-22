import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import { join } from 'path';
import { readFile } from 'fs/promises';
import { execSync } from 'child_process';
import { getConfigDir, loadConfig, ensureConfigComplete, getNeroHome } from '../config.js';
import { NeroClient } from '../client/index.js';
import { migrateDb } from '../db/index.js';
import { openBrowser } from '../mcp/oauth.js';
import { compose, docker } from '../docker/index.js';
import { setConfigJsonEnv } from '../util/env-file.js';

export function registerServiceCommands(program: Command) {
    const syncConfigJsonEnv = async (): Promise<void> => {
        try {
            const config = await ensureConfigComplete();
            const envPath = join(getConfigDir(), '.env');
            await setConfigJsonEnv(envPath, config);
        } catch (error) {
            const message = (error as Error).message;
            console.log(chalk.yellow(`Warning: failed to write NERO_CONFIG_JSON: ${message}`));
        }
    };

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
        .description('Recreate the Nero container using current setup settings')
        .action(async () => {
            // In integrated mode, restart can run from inside a helper container.
            // Ensure HOME resolves to the real host home so ${HOME}/~ expansions
            // in docker-compose.yml and docker-run.sh point at the correct host paths.
            if (process.env.HOST_HOME) {
                process.env.HOME = process.env.HOST_HOME;
            }
            const neroDir = join(getNeroHome(), '.nero');
            const setupStatePath = join(neroDir, 'setup.json');
            const dockerComposePath = join(neroDir, 'docker-compose.yml');
            const dockerRunPath = join(neroDir, 'docker-run.sh');

            let setupState: {
                mode?: string;
                name?: string;
            } = {};
            try {
                const content = await readFile(setupStatePath, 'utf-8');
                setupState = JSON.parse(content);
            } catch {}

            const containerName = setupState.name || 'nero';
            const mode = setupState.mode || 'integrated';
            const isDockerCompose = fs.existsSync(dockerComposePath);
            const isDockerRun = fs.existsSync(dockerRunPath);
            await syncConfigJsonEnv();

            try {
                if (isDockerCompose) {
                    console.log(chalk.dim(`Detected Docker Compose installation (${mode} mode)`));
                    console.log(chalk.dim('Recreating containers...'));
                    compose.restart(neroDir);
                    console.log(chalk.green('Containers recreated'));
                } else if (isDockerRun) {
                    console.log(chalk.dim(`Detected docker-run.sh installation (${mode} mode)`));
                    console.log(chalk.dim('Stopping current container...'));
                    if (!docker.stopAndRemove(containerName)) {
                        console.log(chalk.dim('No existing container to stop'));
                    }

                    console.log(chalk.dim('Starting new container...'));
                    execSync(`bash ${dockerRunPath}`, { stdio: 'inherit' });
                    console.log(chalk.green('Container recreated'));
                } else {
                    console.error(chalk.red('No Docker setup found for Nero.'));
                    console.log(chalk.dim('Run `nero setup` first.'));
                    process.exit(1);
                }
            } catch (error) {
                const err = error as Error;
                console.error(chalk.red(`Restart failed: ${err.message}`));
                process.exit(1);
            }

            process.exit(0);
        });
}
