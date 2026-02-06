import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { NeroClient } from '../client/index.js';
import { Logger } from '../util/logger.js';
import { startRepl } from '../cli/repl.js';

async function readStdin(): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf-8').trim();
}

export function registerChatCommand(program: Command) {
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
                const logger = new Logger('CLI');

                const serviceUrl = process.env.NERO_SERVICE_URL || 'http://localhost:4848';
                const serviceRunning = await NeroClient.checkServiceRunning(serviceUrl);

                if (!serviceRunning) {
                    logger.error('Nero service not running');
                    console.log(chalk.dim('\nStart the service with:'));
                    console.log(chalk.cyan('  docker-compose up -d\n'));
                    process.exit(1);
                }

                const client = new NeroClient({
                    baseUrl: serviceUrl,
                    licenseKey: config.licenseKey,
                });

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
}
