import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { openBrowser } from '../mcp/oauth.js';

const BACKEND_API = process.env.BACKEND_URL || 'https://api.magmadeploy.com';
const LICENSE_URL = 'https://nero.pompeiilabs.com/account';

export function registerLicenseCommands(program: Command) {
    const license = program
        .command('license')
        .description('Manage Nero license for voice/SMS features');

    license
        .command('get', { isDefault: true })
        .description('Open the license page to get or manage your license')
        .action(async () => {
            console.log(chalk.dim(`Opening ${LICENSE_URL}...`));
            openBrowser(LICENSE_URL);
        });

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

            const tunnelUrl = options.url;

            if (!tunnelUrl) {
                console.error(chalk.red('No tunnel URL provided.'));
                console.log(chalk.dim('\nStart a relay first:'));
                console.log(chalk.dim('  nero relay start'));
                console.log(chalk.dim('\nOr provide URL manually:'));
                console.log(chalk.dim('  nero license register --url https://your-tunnel.com'));
                process.exit(1);
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
                    const error = await response
                        .json()
                        .catch(() => ({ message: response.statusText }));
                    throw new Error(
                        (error as { message: string }).message || 'Registration failed',
                    );
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
}
