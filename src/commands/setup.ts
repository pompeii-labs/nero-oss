import { Command } from 'commander';
import chalk from 'chalk';
import os from 'os';
import fs from 'fs';
import { join } from 'path';
import { mkdir, writeFile, readFile, copyFile } from 'fs/promises';
import { execSync } from 'child_process';
import { createInterface } from 'readline/promises';
import { emitKeypressEvents } from 'readline';
import semver from 'semver';
import { getNeroHome, getConfigPath, ensureConfigComplete } from '../config.js';
import { VERSION } from '../util/version.js';
import { setConfigJsonEnv } from '../util/env-file.js';
import {
    generateComposeYaml,
    generateRunScript,
    docker,
    compose,
    hasCompose,
    DEFAULT_IMAGE,
    DEFAULT_BROWSER_IMAGE,
    type DockerConfig,
} from '../docker/index.js';

interface SetupOptions {
    name: string;
    port: string;
    db: boolean;
    integrated: boolean;
    contained: boolean;
    browser: boolean;
    image?: string;
    pull: boolean;
}

const DEFAULT_NERO_ENV = `# Required for hosted models
OPENROUTER_API_KEY=

# Optional - Database
DATABASE_URL=

# Optional - Voice/SMS
ELEVENLABS_API_KEY=
NERO_LICENSE_KEY=
`;

async function ensureSetupPaths(
    neroDir: string,
): Promise<{ envPath: string; createdEnv: boolean; copiedFromHomeEnv: boolean }> {
    const envPath = join(neroDir, '.env');
    const homeEnvPath = join(getNeroHome(), '.env');

    await mkdir(neroDir, { recursive: true });

    if (fs.existsSync(envPath)) {
        return { envPath, createdEnv: false, copiedFromHomeEnv: false };
    }

    if (fs.existsSync(homeEnvPath)) {
        await copyFile(homeEnvPath, envPath);
        return { envPath, createdEnv: true, copiedFromHomeEnv: true };
    }

    await writeFile(envPath, DEFAULT_NERO_ENV, { flag: 'wx' });
    return { envPath, createdEnv: true, copiedFromHomeEnv: false };
}

async function syncConfigJsonEnv(envPath: string): Promise<void> {
    try {
        const config = await ensureConfigComplete();
        await setConfigJsonEnv(envPath, config);
    } catch (error) {
        const message = (error as Error).message;
        console.log(chalk.yellow(`Warning: failed to write NERO_CONFIG_JSON: ${message}`));
    }
}

interface SelectItem<T> {
    label: string;
    value: T;
}

interface MultiSelectItem<T extends string> {
    label: string;
    value: T;
    selected?: boolean;
}

async function selectWithKeyboard<T>(
    question: string,
    items: SelectItem<T>[],
    defaultIndex = 0,
): Promise<T> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        return items[defaultIndex].value;
    }

    return await new Promise<T>((resolve, reject) => {
        let selected = defaultIndex;
        const lineCount = items.length + 2;
        const wasRaw = (process.stdin as NodeJS.ReadStream).isRaw;
        let rendered = false;

        const render = () => {
            const lines = [
                chalk.cyan(question),
                ...items.map(
                    (item, index) => `${index === selected ? chalk.green('>') : ' '} ${item.label}`,
                ),
                chalk.dim('Use up/down arrows, then press Enter'),
            ];

            if (rendered) {
                process.stdout.write(`\x1b[${lineCount}A`);
            }

            for (const line of lines) {
                process.stdout.write('\x1b[2K');
                process.stdout.write(`${line}\n`);
            }

            rendered = true;
        };

        const cleanup = () => {
            process.stdin.removeListener('keypress', onKeypress);
            if (process.stdin.isTTY) {
                process.stdin.setRawMode(Boolean(wasRaw));
            }
            process.stdout.write('\x1b[?25h');
        };

        const onKeypress = (_: string, key: { name?: string; ctrl?: boolean }) => {
            if (key.ctrl && key.name === 'c') {
                cleanup();
                reject(new Error('Setup cancelled by user'));
                return;
            }

            if (key.name === 'up' || key.name === 'k') {
                selected = selected > 0 ? selected - 1 : items.length - 1;
                render();
                return;
            }

            if (key.name === 'down' || key.name === 'j') {
                selected = selected < items.length - 1 ? selected + 1 : 0;
                render();
                return;
            }

            if (key.name === 'return' || key.name === 'enter') {
                const selectedValue = items[selected].value;
                cleanup();
                resolve(selectedValue);
            }
        };

        emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }
        process.stdout.write('\x1b[?25l');
        process.stdin.on('keypress', onKeypress);
        render();
    });
}

async function multiSelectWithKeyboard<T extends string>(
    question: string,
    items: MultiSelectItem<T>[],
): Promise<Set<T>> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        return new Set(items.filter((item) => item.selected).map((item) => item.value));
    }

    return await new Promise<Set<T>>((resolve, reject) => {
        let selectedIndex = 0;
        const selectedValues = new Set<T>(
            items.filter((item) => item.selected).map((item) => item.value),
        );
        const lineCount = items.length + 2;
        const wasRaw = (process.stdin as NodeJS.ReadStream).isRaw;
        let rendered = false;

        const render = () => {
            const lines = [
                chalk.cyan(question),
                ...items.map((item, index) => {
                    const cursor = index === selectedIndex ? chalk.green('>') : ' ';
                    const checked = selectedValues.has(item.value)
                        ? chalk.green('[x]')
                        : chalk.dim('[ ]');
                    return `${cursor} ${checked} ${item.label}`;
                }),
                chalk.dim('Use up/down, space to toggle, Enter to confirm'),
            ];

            if (rendered) {
                process.stdout.write(`\x1b[${lineCount}A`);
            }

            for (const line of lines) {
                process.stdout.write('\x1b[2K');
                process.stdout.write(`${line}\n`);
            }

            rendered = true;
        };

        const cleanup = () => {
            process.stdin.removeListener('keypress', onKeypress);
            if (process.stdin.isTTY) {
                process.stdin.setRawMode(Boolean(wasRaw));
            }
            process.stdout.write('\x1b[?25h');
        };

        const onKeypress = (_: string, key: { name?: string; ctrl?: boolean }) => {
            if (key.ctrl && key.name === 'c') {
                cleanup();
                reject(new Error('Setup cancelled by user'));
                return;
            }

            if (key.name === 'up' || key.name === 'k') {
                selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : items.length - 1;
                render();
                return;
            }

            if (key.name === 'down' || key.name === 'j') {
                selectedIndex = selectedIndex < items.length - 1 ? selectedIndex + 1 : 0;
                render();
                return;
            }

            if (key.name === 'space') {
                const value = items[selectedIndex].value;
                if (selectedValues.has(value)) {
                    selectedValues.delete(value);
                } else {
                    selectedValues.add(value);
                }
                render();
                return;
            }

            if (key.name === 'return' || key.name === 'enter') {
                cleanup();
                resolve(selectedValues);
            }
        };

        emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }
        process.stdout.write('\x1b[?25l');
        process.stdin.on('keypress', onKeypress);
        render();
    });
}

async function promptText(question: string, defaultValue: string): Promise<string> {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        const answer = (await rl.question(`${question} (default: ${defaultValue}): `)).trim();
        return answer || defaultValue;
    } finally {
        rl.close();
    }
}

async function promptSetupOptions(defaults: SetupOptions): Promise<SetupOptions> {
    const recommendedTag = chalk.green('(recommended)');

    const promptMode = async (): Promise<'integrated' | 'contained'> =>
        await selectWithKeyboard(
            'Choose setup mode',
            [
                {
                    label: `Integrated ${recommendedTag} (full host access: filesystem, docker, network)`,
                    value: 'integrated',
                },
                { label: 'Contained (standalone, no host mounts)', value: 'contained' },
            ],
            defaults.contained ? 1 : 0,
        );

    const promptFeatureSelection = async (): Promise<Set<'db' | 'browser'>> =>
        await multiSelectWithKeyboard<'db' | 'browser'>('Select additional features', [
            {
                label: `Local postgres database ${recommendedTag} (requires docker compose)`,
                value: 'db',
                selected: defaults.db,
            },
            {
                label: `Browser automation ${recommendedTag} (larger image with Chromium)`,
                value: 'browser',
                selected: defaults.browser,
            },
        ]);

    const promptContainerName = async (): Promise<string> => {
        while (true) {
            const answer = await promptText('Container name', defaults.name);
            if (answer.length > 0) {
                return answer;
            }
        }
    };

    const promptPort = async (): Promise<string> => {
        while (true) {
            const value = await promptText('Port to expose', defaults.port);
            const port = Number(value);
            if (Number.isInteger(port) && port > 0 && port <= 65535) {
                return value;
            }
        }
    };

    const mode = await promptMode();
    const selectedFeatures = await promptFeatureSelection();
    const name = await promptContainerName();
    const port = await promptPort();

    return {
        name,
        port,
        db: selectedFeatures.has('db'),
        integrated: mode === 'integrated',
        contained: mode === 'contained',
        browser: selectedFeatures.has('browser'),
        image: defaults.image,
        pull: defaults.pull,
    };
}

export function registerSetupCommands(program: Command) {
    program
        .command('setup')
        .description('Set up Nero Docker configuration')
        .option('-n, --name <name>', 'Container name', 'nero')
        .option('-p, --port <port>', 'Port to expose', '4848')
        .option('--db', 'Include a postgres database (requires docker compose)')
        .option('--integrated', 'Full host access: filesystem, docker, network (default)')
        .option('--contained', 'Standalone mode: no host mounts')
        .option('--browser', 'Enable browser automation (larger image with Chromium)')
        .option('--image <image>', 'Override Docker image')
        .option('--no-pull', 'Skip pulling images before start')
        .action(async (options: SetupOptions, command: Command) => {
            const hasCliFlags = (
                [
                    'name',
                    'port',
                    'db',
                    'integrated',
                    'contained',
                    'browser',
                    'image',
                    'pull',
                ] as const
            ).some((optionName) => command.getOptionValueSource(optionName) === 'cli');
            const useInteractive = !hasCliFlags && process.stdin.isTTY && process.stdout.isTTY;
            let setupOptions = options;
            if (useInteractive) {
                try {
                    setupOptions = await promptSetupOptions(options);
                } catch (error) {
                    const message = (error as Error).message;
                    if (message === 'Setup cancelled by user') {
                        console.log(chalk.yellow('\nSetup cancelled.'));
                        return;
                    }
                    throw error;
                }
            }

            const neroDir = join(getNeroHome(), '.nero');
            const setupStatePath = join(neroDir, 'setup.json');
            const { envPath, createdEnv, copiedFromHomeEnv } = await ensureSetupPaths(neroDir);

            if (createdEnv) {
                console.log(chalk.green(`Created ${envPath}`));
                if (!copiedFromHomeEnv) {
                    console.log(chalk.dim('Fill in values in ~/.nero/.env as needed.'));
                }
            }

            const mode = setupOptions.contained ? 'contained' : 'integrated';
            const isIntegrated = mode === 'integrated';
            await syncConfigJsonEnv(envPath);
            const image =
                setupOptions.image ||
                (setupOptions.browser ? DEFAULT_BROWSER_IMAGE : DEFAULT_IMAGE);

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
            if (setupOptions.browser) {
                console.log(chalk.dim('  - Browser automation (Chromium)'));
            }
            console.log();

            if (setupOptions.db && !hasCompose()) {
                console.log(
                    chalk.red('Docker Compose is required when using --db, but it was not found.'),
                );
                console.log(
                    chalk.dim(
                        'Install Docker Compose (v2 preferred: `docker compose`) and run `nero setup --db` again.',
                    ),
                );
                return;
            }

            const setupState = {
                mode,
                compose: !!setupOptions.db,
                name: setupOptions.name,
                port: setupOptions.port,
                image,
                createdAt: new Date().toISOString(),
            };
            await writeFile(setupStatePath, JSON.stringify(setupState, null, 2));

            if (setupOptions.db) {
                const composePath = join(neroDir, 'docker-compose.yml');

                const dockerConfig: DockerConfig = {
                    name: setupOptions.name,
                    port: setupOptions.port,
                    relayPort: '4848',
                    mode,
                    image,
                };

                const composeFile = generateComposeYaml(dockerConfig);
                await writeFile(composePath, composeFile);
                console.log(chalk.green('Created ~/.nero/docker-compose.yml'));

                if (setupOptions.pull) {
                    console.log(chalk.dim('\nPulling images...'));
                    compose.pull(neroDir);
                } else {
                    console.log(chalk.dim('\nSkipping image pull (--no-pull)'));
                }

                console.log(chalk.dim('Starting services...'));
                compose.up(neroDir);

                console.log(chalk.green(`\nNero is running in ${mode} mode with Postgres!`));
                console.log(
                    chalk.dim(`\nDashboard: http://localhost:${setupOptions.port}/quickstart`),
                );
                console.log(chalk.dim('To update: nero update'));
                console.log(
                    chalk.dim(
                        `To switch modes: nero setup ${options.db ? '--db' : ''} ${options.browser ? '--browser' : ''} --${mode === 'integrated' ? 'contained' : 'integrated'}`,
                    ),
                );
            } else {
                const dockerRunPath = join(neroDir, 'docker-run.sh');

                const dockerConfig: DockerConfig = {
                    name: setupOptions.name,
                    port: setupOptions.port,
                    relayPort: '4848',
                    mode,
                    image,
                };

                const script = generateRunScript(dockerConfig);
                await writeFile(dockerRunPath, script);
                fs.chmodSync(dockerRunPath, '755');

                console.log(chalk.green('Created ~/.nero/docker-run.sh'));

                if (setupOptions.pull) {
                    console.log(chalk.dim('\nPulling latest image...'));
                    docker.pull(image);
                } else {
                    console.log(chalk.dim('\nSkipping image pull (--no-pull)'));
                }

                console.log(chalk.dim('Stopping any existing container...'));
                docker.stopAndRemove(setupOptions.name);

                console.log(chalk.dim('Starting Nero...'));
                execSync(`bash ${dockerRunPath}`, { stdio: 'inherit' });

                console.log(chalk.green(`\nNero is running in ${mode} mode!`));
                console.log(
                    chalk.dim(`\nDashboard: http://localhost:${setupOptions.port}/quickstart`),
                );
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
                `Mode: ${chalk.cyan(mode)}${mode === 'integrated' ? chalk.dim(' (full host access)') : mode === 'contained' ? chalk.dim(' (standalone)') : ''}`,
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
                console.log(chalk.dim('  - No host mounts'));
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
