import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, saveConfig } from '../config.js';

export function registerAutonomyCommands(program: Command) {
    const autonomy = program.command('autonomy').description('Manage autonomous mode');

    autonomy
        .command('on')
        .alias('enable')
        .description('Enable autonomy mode (disables background thinking)')
        .action(async () => {
            const config = await loadConfig();
            config.autonomy = { ...config.autonomy, enabled: true };
            if (config.proactivity.enabled) {
                config.proactivity = { ...config.proactivity, enabled: false };
                console.log(chalk.dim('Background thinking auto-disabled (autonomy takes over).'));
            }
            await saveConfig(config);
            console.log(chalk.green('Autonomy mode enabled.'));
        });

    autonomy
        .command('off')
        .alias('disable')
        .description('Disable autonomy mode')
        .action(async () => {
            const config = await loadConfig();
            config.autonomy = { ...config.autonomy, enabled: false };
            await saveConfig(config);
            console.log(chalk.yellow('Autonomy mode disabled.'));
        });

    autonomy
        .command('status')
        .description('Show autonomy mode status and settings')
        .action(async () => {
            const config = await loadConfig();
            const a = config.autonomy;

            console.log(chalk.bold('\nAutonomy Mode:\n'));
            console.log(
                `  Status: ${a.enabled ? chalk.green('enabled') : chalk.yellow('disabled')}`,
            );
            console.log(`  Max session: ${chalk.cyan(`${a.maxSessionMinutes} minutes`)}`);
            console.log(
                `  Sleep range: ${chalk.cyan(`${a.minSleepMinutes}-${a.maxSleepMinutes} minutes`)}`,
            );
            console.log(
                `  Daily token budget: ${a.dailyTokenBudget > 0 ? chalk.cyan(a.dailyTokenBudget.toLocaleString()) : chalk.cyan('unlimited')}`,
            );
            console.log(
                `  Max sessions/day: ${a.maxSessionsPerDay > 0 ? chalk.cyan(String(a.maxSessionsPerDay)) : chalk.cyan('unlimited')}`,
            );
            console.log(
                `  Destructive actions: ${a.destructive ? chalk.yellow('allowed') : chalk.green('blocked')}`,
            );
            console.log(`  Protected branches: ${chalk.cyan(a.protectedBranches.join(', '))}`);
            console.log(`  Notifications: ${a.notify ? chalk.green('on') : chalk.dim('off')}`);
            console.log();
        });

    autonomy
        .command('budget <tokens>')
        .description('Set daily token budget for autonomous sessions (0 for unlimited)')
        .action(async (tokens) => {
            const value = parseInt(tokens, 10);
            if (isNaN(value) || value < 0) {
                console.log(chalk.red('Budget must be a non-negative number (0 for unlimited).'));
                return;
            }
            const config = await loadConfig();
            config.autonomy = { ...config.autonomy, dailyTokenBudget: value };
            await saveConfig(config);
            console.log(
                value > 0
                    ? chalk.green(`Daily token budget set to ${value.toLocaleString()}.`)
                    : chalk.green('Daily token budget set to unlimited.'),
            );
        });

    autonomy
        .command('destructive <on|off>')
        .description('Allow or block destructive actions during autonomous sessions')
        .action(async (value) => {
            const config = await loadConfig();
            const destructive = value === 'on' || value === 'true' || value === '1';
            config.autonomy = { ...config.autonomy, destructive };
            await saveConfig(config);
            console.log(
                destructive
                    ? chalk.yellow('Destructive actions allowed during autonomous sessions.')
                    : chalk.green('Destructive actions blocked during autonomous sessions.'),
            );
        });

    autonomy
        .command('sleep <min> <max>')
        .description('Set sleep range in minutes between autonomous sessions')
        .action(async (min, max) => {
            const minVal = parseInt(min, 10);
            const maxVal = parseInt(max, 10);
            if (isNaN(minVal) || isNaN(maxVal) || minVal < 1 || maxVal < minVal) {
                console.log(chalk.red('Invalid range. Min must be >= 1 and max must be >= min.'));
                return;
            }
            const config = await loadConfig();
            config.autonomy = {
                ...config.autonomy,
                minSleepMinutes: minVal,
                maxSleepMinutes: maxVal,
            };
            await saveConfig(config);
            console.log(chalk.green(`Sleep range set to ${minVal}-${maxVal} minutes.`));
        });

    autonomy
        .command('notify <on|off>')
        .description('Toggle notifications for urgent findings during autonomous sessions')
        .action(async (value) => {
            const config = await loadConfig();
            const notify = value === 'on' || value === 'true' || value === '1';
            config.autonomy = { ...config.autonomy, notify };
            await saveConfig(config);
            console.log(
                notify
                    ? chalk.green('Notifications enabled for autonomous sessions.')
                    : chalk.yellow('Notifications disabled for autonomous sessions.'),
            );
        });
}
