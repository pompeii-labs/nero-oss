import { Command } from 'commander';
import chalk from 'chalk';
import { NeroClient } from '../client/index.js';
import { loadConfig } from '../config.js';

function getServiceUrl(): string {
    return process.env.NERO_SERVICE_URL || 'http://localhost:4847';
}

export function registerActionsCommands(program: Command) {
    const actions = program.command('actions').description('Manage scheduled actions');

    actions
        .command('list')
        .alias('ls')
        .description('List all scheduled actions')
        .action(async () => {
            const config = await loadConfig();
            const client = new NeroClient({
                baseUrl: getServiceUrl(),
                licenseKey: config.licenseKey,
            });

            try {
                const actions = await client.getActions();

                if (actions.length === 0) {
                    console.log(chalk.dim('No scheduled actions.'));
                    return;
                }

                console.log(chalk.bold('\nScheduled Actions:\n'));
                for (const action of actions) {
                    const enabled = action.enabled !== false;
                    const status = enabled ? chalk.green('enabled') : chalk.dim('disabled');
                    const recurrence = action.recurrence
                        ? chalk.cyan(` (${action.recurrence})`)
                        : '';
                    const nextRun = new Date(action.timestamp).toLocaleString();

                    console.log(`  ${chalk.dim(`#${action.id}`)} ${action.request}`);
                    console.log(`    Status: ${status}${recurrence}`);
                    console.log(`    Next run: ${chalk.cyan(nextRun)}`);
                    if (action.last_run) {
                        console.log(
                            `    Last run: ${chalk.dim(new Date(action.last_run).toLocaleString())}`,
                        );
                    }
                    console.log();
                }
            } catch (error) {
                console.error(chalk.red(`Failed to list actions: ${(error as Error).message}`));
            }
        });

    actions
        .command('add <request>')
        .description('Create a new action')
        .option('--at <timestamp>', 'When to run (ISO timestamp or time like "09:00")')
        .option('--every <recurrence>', 'Recurrence (daily, weekly, monthly, yearly, or JSON rule)')
        .action(async (request, opts) => {
            const config = await loadConfig();
            const client = new NeroClient({
                baseUrl: getServiceUrl(),
                licenseKey: config.licenseKey,
            });

            let timestamp: string;
            if (opts.at) {
                const parsed = new Date(opts.at);
                if (isNaN(parsed.getTime())) {
                    const timeMatch = opts.at.match(/^(\d{1,2}):(\d{2})$/);
                    if (timeMatch) {
                        const now = new Date();
                        now.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0);
                        if (now <= new Date()) now.setDate(now.getDate() + 1);
                        timestamp = now.toISOString();
                    } else {
                        console.error(chalk.red('Invalid timestamp. Use ISO format or HH:MM.'));
                        return;
                    }
                } else {
                    timestamp = parsed.toISOString();
                }
            } else {
                timestamp = new Date().toISOString();
            }

            let recurrence: string | null = null;
            if (opts.every) {
                const simple: Record<string, object> = {
                    daily: { unit: 'daily' },
                    weekly: { unit: 'weekly' },
                    monthly: { unit: 'monthly' },
                    yearly: { unit: 'yearly' },
                };

                const minuteMatch =
                    opts.every.match(/^(\d+)\s*min(ute)?s?$/i) ||
                    (opts.every === 'minute' ? ['', '1'] : null);
                const hourMatch =
                    opts.every.match(/^(\d+)\s*hours?$/i) ||
                    (opts.every === 'hour' ? ['', '1'] : null);

                if (minuteMatch) {
                    const minutes = parseInt(minuteMatch[1], 10) || 1;
                    recurrence = JSON.stringify({
                        unit: 'every_x_minutes',
                        every_x_minutes: minutes,
                    });
                } else if (hourMatch) {
                    const hours = parseInt(hourMatch[1], 10) || 1;
                    recurrence = JSON.stringify({ unit: 'every_x_hours', every_x_hours: hours });
                } else if (simple[opts.every]) {
                    const rule: any = { ...simple[opts.every] };
                    if (opts.at) {
                        const timeMatch = opts.at.match(/^(\d{1,2}):(\d{2})$/);
                        if (timeMatch) {
                            rule.hour = parseInt(timeMatch[1], 10);
                            rule.minute = parseInt(timeMatch[2], 10);
                        }
                    }
                    recurrence = JSON.stringify(rule);
                } else {
                    try {
                        JSON.parse(opts.every);
                        recurrence = opts.every;
                    } catch {
                        console.error(
                            chalk.red(
                                'Invalid recurrence. Use: minute, hour, daily, weekly, monthly, yearly, "5 minutes", "2 hours", or a JSON rule.',
                            ),
                        );
                        return;
                    }
                }
            }

            try {
                const action = await client.createAction({
                    request,
                    timestamp,
                    recurrence,
                    steps: [],
                    enabled: true,
                });
                console.log(chalk.green(`Action #${action.id} created.`));
                console.log(
                    chalk.dim(`  Next run: ${new Date(action.timestamp).toLocaleString()}`),
                );
                if (action.recurrence) {
                    console.log(chalk.dim(`  Recurrence: ${action.recurrence}`));
                }
            } catch (error) {
                console.error(chalk.red(`Failed to create action: ${(error as Error).message}`));
            }
        });

    actions
        .command('remove <id>')
        .alias('rm')
        .description('Delete an action')
        .action(async (id) => {
            const config = await loadConfig();
            const client = new NeroClient({
                baseUrl: getServiceUrl(),
                licenseKey: config.licenseKey,
            });

            try {
                await client.deleteAction(parseInt(id, 10));
                console.log(chalk.green(`Action #${id} deleted.`));
            } catch (error) {
                console.error(chalk.red(`Failed to delete action: ${(error as Error).message}`));
            }
        });

    actions
        .command('enable <id>')
        .description('Enable an action')
        .action(async (id) => {
            const config = await loadConfig();
            const client = new NeroClient({
                baseUrl: getServiceUrl(),
                licenseKey: config.licenseKey,
            });

            try {
                await client.updateAction(parseInt(id, 10), { enabled: true });
                console.log(chalk.green(`Action #${id} enabled.`));
            } catch (error) {
                console.error(chalk.red(`Failed to enable action: ${(error as Error).message}`));
            }
        });

    actions
        .command('disable <id>')
        .description('Disable an action')
        .action(async (id) => {
            const config = await loadConfig();
            const client = new NeroClient({
                baseUrl: getServiceUrl(),
                licenseKey: config.licenseKey,
            });

            try {
                await client.updateAction(parseInt(id, 10), { enabled: false });
                console.log(chalk.yellow(`Action #${id} disabled.`));
            } catch (error) {
                console.error(chalk.red(`Failed to disable action: ${(error as Error).message}`));
            }
        });

    actions
        .command('history [id]')
        .description('Show action run history')
        .option('-n, --limit <number>', 'Number of runs to show', '10')
        .action(async (id, opts) => {
            const config = await loadConfig();
            const client = new NeroClient({
                baseUrl: getServiceUrl(),
                licenseKey: config.licenseKey,
            });

            const limit = parseInt(opts.limit, 10);

            try {
                const runs = id
                    ? await client.getActionRuns(parseInt(id, 10), limit)
                    : await client.getActionRuns(0, limit);

                if (runs.length === 0) {
                    console.log(chalk.dim('No action runs found.'));
                    return;
                }

                console.log(chalk.bold('\nAction Run History:\n'));
                for (const run of runs) {
                    const statusColor =
                        run.status === 'success'
                            ? chalk.green
                            : run.status === 'error'
                              ? chalk.red
                              : chalk.yellow;
                    const started = new Date(run.started_at).toLocaleString();
                    const duration = run.duration_ms ? `${run.duration_ms}ms` : 'running';

                    console.log(
                        `  ${chalk.dim(`#${run.id}`)} Action #${run.action_id} ${statusColor(run.status)} ${chalk.dim(`(${duration})`)}`,
                    );
                    console.log(`    Started: ${chalk.dim(started)}`);
                    if (run.result) {
                        console.log(`    Result: ${chalk.dim(run.result.slice(0, 100))}`);
                    }
                    if (run.error) {
                        console.log(`    Error: ${chalk.red(run.error.slice(0, 100))}`);
                    }
                    console.log();
                }
            } catch (error) {
                console.error(chalk.red(`Failed to get history: ${(error as Error).message}`));
            }
        });

    actions
        .command('run <id>')
        .description('Trigger an action immediately')
        .action(async (id) => {
            const config = await loadConfig();
            const client = new NeroClient({
                baseUrl: getServiceUrl(),
                licenseKey: config.licenseKey,
            });

            console.log(chalk.dim(`Triggering action #${id}...`));

            try {
                const run = await client.triggerAction(parseInt(id, 10));
                const statusColor =
                    run.status === 'success'
                        ? chalk.green
                        : run.status === 'error'
                          ? chalk.red
                          : chalk.yellow;

                console.log(`\n${statusColor(run.status)} ${chalk.dim(`(${run.duration_ms}ms)`)}`);
                if (run.result) {
                    console.log(chalk.dim(run.result.slice(0, 500)));
                }
                if (run.error) {
                    console.error(chalk.red(run.error));
                }
            } catch (error) {
                console.error(chalk.red(`Failed to trigger action: ${(error as Error).message}`));
            }
        });
}
