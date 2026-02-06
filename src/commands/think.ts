import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, saveConfig } from '../config.js';

export function registerThinkCommands(program: Command) {
    const think = program.command('think').description('Manage background thinking');

    think
        .command('on')
        .alias('enable')
        .description('Enable background thinking')
        .action(async () => {
            const config = await loadConfig();
            config.proactivity = { ...config.proactivity, enabled: true };
            await saveConfig(config);
            console.log(chalk.green('Background thinking enabled.'));
        });

    think
        .command('off')
        .alias('disable')
        .description('Disable background thinking')
        .action(async () => {
            const config = await loadConfig();
            config.proactivity = { ...config.proactivity, enabled: false };
            await saveConfig(config);
            console.log(chalk.yellow('Background thinking disabled.'));
        });

    think
        .command('status')
        .description('Show background thinking status')
        .action(async () => {
            const config = await loadConfig();
            const enabled = config.proactivity?.enabled ?? false;
            const notify = config.proactivity?.notify ?? false;
            const destructive = config.proactivity?.destructive ?? false;
            const protectedBranches = config.proactivity?.protectedBranches ?? ['main', 'master'];

            console.log(chalk.bold('\nBackground Thinking:\n'));
            console.log(`  Status: ${enabled ? chalk.green('enabled') : chalk.yellow('disabled')}`);
            console.log(`  Notifications: ${notify ? chalk.green('on') : chalk.dim('off')}`);
            console.log(
                `  Destructive actions: ${destructive ? chalk.yellow('allowed') : chalk.green('blocked')}`,
            );
            console.log(`  Protected branches: ${chalk.cyan(protectedBranches.join(', '))}`);
            console.log();
        });

    think
        .command('notify <on|off>')
        .description('Toggle notifications for urgent thoughts')
        .action(async (value) => {
            const config = await loadConfig();
            const notify = value === 'on' || value === 'true' || value === '1';
            config.proactivity = { ...config.proactivity, notify };
            await saveConfig(config);
            console.log(
                notify
                    ? chalk.green('Notifications enabled for urgent thoughts.')
                    : chalk.yellow('Notifications disabled.'),
            );
        });

    think
        .command('destructive <on|off>')
        .description('Allow or block destructive actions during background thinking')
        .action(async (value) => {
            const config = await loadConfig();
            const destructive = value === 'on' || value === 'true' || value === '1';
            config.proactivity = { ...config.proactivity, destructive };
            await saveConfig(config);
            console.log(
                destructive
                    ? chalk.yellow('Destructive actions allowed during background thinking.')
                    : chalk.green('Destructive actions blocked during background thinking.'),
            );
        });

    think
        .command('protect <branch>')
        .description('Add a branch to the protected list (no auto-push)')
        .action(async (branch) => {
            const config = await loadConfig();
            const protectedBranches = config.proactivity?.protectedBranches ?? ['main', 'master'];
            if (!protectedBranches.includes(branch)) {
                protectedBranches.push(branch);
                config.proactivity = { ...config.proactivity, protectedBranches };
                await saveConfig(config);
                console.log(chalk.green(`Added '${branch}' to protected branches.`));
            } else {
                console.log(chalk.yellow(`'${branch}' is already protected.`));
            }
        });

    think
        .command('unprotect <branch>')
        .description('Remove a branch from the protected list')
        .action(async (branch) => {
            const config = await loadConfig();
            const protectedBranches = config.proactivity?.protectedBranches ?? ['main', 'master'];
            const index = protectedBranches.indexOf(branch);
            if (index !== -1) {
                protectedBranches.splice(index, 1);
                config.proactivity = { ...config.proactivity, protectedBranches };
                await saveConfig(config);
                console.log(chalk.green(`Removed '${branch}' from protected branches.`));
            } else {
                console.log(chalk.yellow(`'${branch}' is not in the protected list.`));
            }
        });
}
