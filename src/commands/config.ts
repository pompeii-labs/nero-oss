import { Command } from 'commander';
import chalk from 'chalk';
import {
    loadConfig,
    getConfigPath,
    updateSettings,
    isOpenRouter,
    OPENROUTER_BASE_URL,
} from '../config.js';

const SETTABLE_KEYS: Record<string, { parse: (v: string) => unknown; description: string }> = {
    model: { parse: (v) => v, description: 'LLM model identifier' },
    baseUrl: {
        parse: (v) => (v === 'openrouter' ? undefined : v),
        description: 'API base URL (or "openrouter" to reset)',
    },
    streaming: {
        parse: (v) => v === 'true' || v === 'on',
        description: 'Enable streaming responses',
    },
    verbose: { parse: (v) => v === 'true' || v === 'on', description: 'Enable verbose logging' },
    timezone: {
        parse: (v) => (v === 'auto' ? undefined : v),
        description: 'Timezone (or "auto" to reset)',
    },
};

export function registerConfigCommand(program: Command) {
    const configCmd = program.command('config').description('Show or update configuration');

    configCmd.action(async () => {
        const config = await loadConfig();
        const provider = isOpenRouter(config) ? 'OpenRouter' : config.settings.baseUrl || 'custom';

        console.log(chalk.bold('\nNero Configuration:\n'));

        console.log(chalk.dim('Settings:'));
        console.log(
            `  Streaming: ${config.settings.streaming ? chalk.green('on') : chalk.yellow('off')}`,
        );
        console.log(`  Model: ${chalk.cyan(config.settings.model)}`);
        console.log(
            `  Provider: ${chalk.cyan(provider)}${isOpenRouter(config) ? chalk.dim(' (default)') : ''}`,
        );
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

    configCmd
        .command('set <key> <value>')
        .description('Set a configuration value (model, baseUrl, streaming, verbose, timezone)')
        .action(async (key: string, value: string) => {
            const setter = SETTABLE_KEYS[key];
            if (!setter) {
                console.error(chalk.red(`Unknown setting: ${key}`));
                console.log(chalk.dim('Available settings:'));
                for (const [k, v] of Object.entries(SETTABLE_KEYS)) {
                    console.log(`  ${chalk.cyan(k)} - ${v.description}`);
                }
                return;
            }

            const parsed = setter.parse(value);
            await updateSettings({ [key]: parsed } as any);
            const display =
                parsed === undefined ? chalk.dim('(reset to default)') : chalk.cyan(String(parsed));
            console.log(`${chalk.green('Set')} ${key} = ${display}`);
        });

    configCmd
        .command('get <key>')
        .description('Get a configuration value')
        .action(async (key: string) => {
            const config = await loadConfig();
            const settings = config.settings as unknown as Record<string, unknown>;
            if (!(key in settings)) {
                console.error(chalk.red(`Unknown setting: ${key}`));
                return;
            }
            const value = settings[key];
            console.log(value !== undefined ? String(value) : chalk.dim('(not set)'));
        });
}
