import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, getConfigPath } from '../config.js';

export function registerConfigCommand(program: Command) {
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
}
