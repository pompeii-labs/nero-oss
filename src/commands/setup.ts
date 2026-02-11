import { Command } from 'commander';
import chalk from 'chalk';
import os from 'os';
import fs from 'fs';
import { join } from 'path';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { execSync } from 'child_process';
import semver from 'semver';
import { getNeroHome, getConfigPath } from '../config.js';
import { VERSION } from '../util/version.js';
import {
    generateComposeYaml,
    generateRunScript,
    docker,
    compose,
    DEFAULT_IMAGE,
    DEFAULT_BROWSER_IMAGE,
    type DockerConfig,
} from '../docker/index.js';

export function registerSetupCommands(program: Command) {
    program
        .command('setup')
        .description('Set up Nero Docker configuration')
        .option('-n, --name <name>', 'Container name', 'nero')
        .option('-p, --port <port>', 'Port to expose', '4848')
        .option('-c, --compose', 'Use Docker Compose (includes Postgres)')
        .option('--integrated', 'Full host access: filesystem, docker, network (default)')
        .option('--contained', 'Sandboxed mode: no host access')
        .option('--browser', 'Enable browser automation (larger image with Chromium)')
        .action(async (options) => {
            const neroDir = join(getNeroHome(), '.nero');
            const envPath = join(neroDir, '.env');
            const setupStatePath = join(neroDir, 'setup.json');

            await mkdir(neroDir, { recursive: true });

            if (!fs.existsSync(envPath)) {
                console.log(chalk.yellow('No .env file found at ~/.nero/.env'));
                console.log(chalk.dim('Create one with your environment variables:'));
                console.log(chalk.dim('  OPENROUTER_API_KEY=...'));
                console.log(chalk.dim('\nThen run: nero setup'));
                return;
            }

            const mode = options.contained ? 'contained' : 'integrated';
            const isIntegrated = mode === 'integrated';
            const image = options.browser ? DEFAULT_BROWSER_IMAGE : DEFAULT_IMAGE;

            console.log(chalk.dim(`Setting up Nero in ${chalk.cyan(mode)} mode...`));
            if (isIntegrated) {
                console.log(chalk.dim('  - Full host filesystem access'));
                console.log(chalk.dim('  - Docker daemon access'));
                console.log(chalk.dim('  - Host network mode'));
            } else {
                console.log(chalk.dim('  - Container-only filesystem'));
                console.log(chalk.dim('  - No docker access'));
                console.log(chalk.dim('  - Isolated network'));
            }
            if (options.browser) {
                console.log(chalk.dim('  - Browser automation (Chromium)'));
            }
            console.log();

            const setupState = {
                mode,
                compose: !!options.compose,
                name: options.name,
                port: options.port,
                image,
                createdAt: new Date().toISOString(),
            };
            await writeFile(setupStatePath, JSON.stringify(setupState, null, 2));

            if (options.compose) {
                const composePath = join(neroDir, 'docker-compose.yml');

                const dockerConfig: DockerConfig = {
                    name: options.name,
                    port: options.port,
                    relayPort: '4848',
                    mode,
                    image,
                };

                const composeFile = generateComposeYaml(dockerConfig);
                await writeFile(composePath, composeFile);
                console.log(chalk.green('Created ~/.nero/docker-compose.yml'));

                console.log(chalk.dim('\nPulling images...'));
                compose.pull(neroDir);

                console.log(chalk.dim('Starting services...'));
                compose.up(neroDir);

                console.log(chalk.green(`\nNero is running in ${mode} mode with Postgres!`));
                console.log(chalk.dim(`\nDashboard: http://localhost:${options.port}`));
                console.log(chalk.dim('To update: nero update'));
                console.log(
                    chalk.dim(
                        `To switch modes: nero setup --compose --${mode === 'integrated' ? 'contained' : 'integrated'}`,
                    ),
                );
            } else {
                const dockerRunPath = join(neroDir, 'docker-run.sh');

                const dockerConfig: DockerConfig = {
                    name: options.name,
                    port: options.port,
                    relayPort: '4848',
                    mode,
                    image,
                };

                const script = generateRunScript(dockerConfig);
                await writeFile(dockerRunPath, script);
                fs.chmodSync(dockerRunPath, '755');

                console.log(chalk.green('Created ~/.nero/docker-run.sh'));

                console.log(chalk.dim('\nPulling latest image...'));
                docker.pull(image);

                console.log(chalk.dim('Stopping any existing container...'));
                docker.stopAndRemove(options.name);

                console.log(chalk.dim('Starting Nero...'));
                execSync(`bash ${dockerRunPath}`, { stdio: 'inherit' });

                console.log(chalk.green(`\nNero is running in ${mode} mode!`));
                console.log(chalk.dim(`\nDashboard: http://localhost:${options.port}`));
                console.log(chalk.dim('To update: nero update'));
                console.log(
                    chalk.dim(
                        `To switch modes: nero setup --${mode === 'integrated' ? 'contained' : 'integrated'}`,
                    ),
                );
            }
        });

    program
        .command('update')
        .description('Update Nero to the latest version')
        .option('--check', 'Check for updates without installing')
        .action(async (options) => {
            const REPO = 'pompeii-labs/nero-oss';
            const neroDir = join(getNeroHome(), '.nero');
            const setupStatePath = join(neroDir, 'setup.json');

            let setupState: {
                mode?: string;
                compose?: boolean;
                name?: string;
                port?: string;
                image?: string;
            } = {};
            try {
                const content = await readFile(setupStatePath, 'utf-8');
                setupState = JSON.parse(content);
            } catch {}

            const containerName = setupState.name || 'nero';
            const mode = setupState.mode || 'integrated';
            const image = setupState.image || DEFAULT_IMAGE;

            console.log(chalk.dim('Checking for updates...'));

            try {
                const response = await fetch(
                    `https://api.github.com/repos/${REPO}/releases/latest`,
                );
                const data = await response.json();
                const latestTag = data.tag_name;
                const latestVersion = latestTag?.replace(/^v/, '');

                console.log(`Current: ${chalk.cyan(VERSION)}`);
                console.log(`Latest:  ${chalk.cyan(latestVersion)}`);
                console.log(`Mode:    ${chalk.cyan(mode)}`);

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

                const dockerComposePath = join(neroDir, 'docker-compose.yml');
                const dockerRunPath = join(neroDir, 'docker-run.sh');

                const isDockerCompose = fs.existsSync(dockerComposePath);
                const isDockerRun = fs.existsSync(dockerRunPath);

                if (isDockerCompose) {
                    console.log(chalk.dim(`Detected Docker Compose installation (${mode} mode)`));

                    console.log(chalk.dim('Pulling latest image...'));
                    compose.pull(neroDir);

                    console.log(chalk.dim('Restarting containers...'));
                    compose.restart(neroDir);

                    console.log(chalk.green('\nDocker containers updated!'));
                } else if (isDockerRun) {
                    console.log(chalk.dim(`Detected docker-run.sh installation (${mode} mode)`));

                    console.log(chalk.dim('Pulling latest image...'));
                    docker.pull(image);

                    console.log(chalk.dim('Stopping current container...'));
                    if (!docker.stopAndRemove(containerName)) {
                        console.log(chalk.dim('No existing container to stop'));
                    }

                    console.log(chalk.dim('Starting new container...'));
                    execSync(`bash ${dockerRunPath}`, { stdio: 'inherit' });

                    console.log(chalk.green('\nDocker container updated!'));
                } else {
                    console.log(
                        chalk.yellow('No Docker installation detected. Updating CLI only.'),
                    );
                }

                console.log(chalk.dim('\nUpdating CLI binary...'));

                const platform = os.platform();
                const arch = os.arch();

                const osName = platform === 'darwin' ? 'darwin' : 'linux';
                const archName = arch === 'arm64' ? 'arm64' : 'x64';
                const binary = `nero-${osName}-${archName}`;

                const binaryUrl = `https://github.com/${REPO}/releases/download/${latestTag}/${binary}`;

                let currentBinaryPath: string;
                try {
                    currentBinaryPath = execSync('which nero', { encoding: 'utf-8' }).trim();
                } catch {
                    currentBinaryPath = '/usr/local/bin/nero';
                }

                const needsSudo = currentBinaryPath.startsWith('/usr/local');

                console.log(chalk.dim(`Downloading ${binary}...`));
                console.log(chalk.dim(`Installing to ${currentBinaryPath}`));

                const installCmd = needsSudo
                    ? `curl -fsSL -o /tmp/nero "${binaryUrl}" && chmod +x /tmp/nero && sudo mv /tmp/nero "${currentBinaryPath}"`
                    : `curl -fsSL -o /tmp/nero "${binaryUrl}" && chmod +x /tmp/nero && mv /tmp/nero "${currentBinaryPath}"`;

                execSync(installCmd, { stdio: 'inherit' });

                console.log(chalk.green(`\nNero updated to ${latestVersion}!`));
            } catch (error) {
                const err = error as Error;
                console.error(chalk.red(`Update failed: ${err.message}`));
                process.exit(1);
            }
        });

    program
        .command('status')
        .description('Show Nero installation status')
        .action(async () => {
            const neroDir = join(getNeroHome(), '.nero');
            const setupStatePath = join(neroDir, 'setup.json');
            const dockerComposePath = join(neroDir, 'docker-compose.yml');
            const dockerRunPath = join(neroDir, 'docker-run.sh');

            console.log(chalk.bold('\nNero Status\n'));

            console.log(`CLI Version: ${chalk.cyan(VERSION)}`);

            let setupState: {
                mode?: string;
                compose?: boolean;
                name?: string;
                port?: string;
                image?: string;
                createdAt?: string;
            } = {};
            try {
                const content = await readFile(setupStatePath, 'utf-8');
                setupState = JSON.parse(content);
            } catch {}

            const containerName = setupState.name || 'nero';
            const mode = setupState.mode || 'unknown';
            const installType = fs.existsSync(dockerComposePath)
                ? 'Docker Compose'
                : fs.existsSync(dockerRunPath)
                  ? 'Docker Run'
                  : 'Not installed';

            const hasBrowser = setupState.image?.includes('browser') ?? false;

            console.log(`Install Type: ${chalk.cyan(installType)}`);
            console.log(
                `Mode: ${chalk.cyan(mode)}${mode === 'integrated' ? chalk.dim(' (full host access)') : mode === 'contained' ? chalk.dim(' (sandboxed)') : ''}`,
            );
            console.log(`Browser: ${hasBrowser ? chalk.green('enabled') : chalk.dim('disabled')}`);
            console.log(`Container: ${chalk.cyan(containerName)}`);
            if (setupState.port) {
                console.log(`Port: ${chalk.cyan(setupState.port)}`);
            }
            if (setupState.createdAt) {
                console.log(
                    `Setup Date: ${chalk.dim(new Date(setupState.createdAt).toLocaleString())}`,
                );
            }

            console.log();

            try {
                const containerStatus = execSync(
                    `docker inspect --format='{{.State.Status}}' ${containerName} 2>/dev/null`,
                    { encoding: 'utf-8' },
                ).trim();
                const containerHealth = execSync(
                    `docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no healthcheck{{end}}' ${containerName} 2>/dev/null`,
                    { encoding: 'utf-8' },
                ).trim();
                const containerUptime = execSync(
                    `docker inspect --format='{{.State.StartedAt}}' ${containerName} 2>/dev/null`,
                    { encoding: 'utf-8' },
                ).trim();

                const statusColor = containerStatus === 'running' ? chalk.green : chalk.red;
                console.log(`Container Status: ${statusColor(containerStatus)}`);
                if (containerHealth !== 'no healthcheck') {
                    const healthColor =
                        containerHealth === 'healthy'
                            ? chalk.green
                            : containerHealth === 'unhealthy'
                              ? chalk.red
                              : chalk.yellow;
                    console.log(`Health: ${healthColor(containerHealth)}`);
                }
                if (containerUptime) {
                    const startedAt = new Date(containerUptime);
                    const uptime = Date.now() - startedAt.getTime();
                    const hours = Math.floor(uptime / (1000 * 60 * 60));
                    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
                    console.log(`Uptime: ${chalk.dim(`${hours}h ${minutes}m`)}`);
                }
            } catch {
                console.log(`Container Status: ${chalk.yellow('not running')}`);
            }

            if (fs.existsSync(dockerComposePath)) {
                try {
                    const dbStatus = execSync(
                        `docker inspect --format='{{.State.Status}}' nero-db 2>/dev/null`,
                        { encoding: 'utf-8' },
                    ).trim();
                    const dbColor = dbStatus === 'running' ? chalk.green : chalk.red;
                    console.log(`Database: ${dbColor(dbStatus)}`);
                } catch {
                    console.log(`Database: ${chalk.yellow('not running')}`);
                }
            }

            console.log();

            if (mode === 'integrated') {
                console.log(chalk.dim('Capabilities:'));
                console.log(chalk.dim('  - Host filesystem access (/host/home)'));
                console.log(chalk.dim('  - Docker daemon access'));
                console.log(chalk.dim('  - Host network'));
                if (hasBrowser) console.log(chalk.dim('  - Browser automation (Chromium)'));
            } else if (mode === 'contained') {
                console.log(chalk.dim('Capabilities:'));
                console.log(chalk.dim('  - Container-only filesystem'));
                console.log(chalk.dim('  - No docker access'));
                console.log(chalk.dim('  - Isolated network'));
                if (hasBrowser) console.log(chalk.dim('  - Browser automation (Chromium)'));
            }

            console.log();
            console.log(chalk.dim(`Config: ${getConfigPath()}`));
            console.log(chalk.dim(`Dashboard: http://localhost:${setupState.port || '4848'}`));
            console.log();
        });
}
