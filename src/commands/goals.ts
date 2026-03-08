import { Command } from 'commander';
import chalk from 'chalk';
import { Goal, Milestone, Task } from '../models/index.js';
import { initDb } from '../db/index.js';
import {
    createGoal,
    getProgressReport,
    advanceMilestone,
    getAutonomyTasks,
    getActiveGoalsOverview,
    getGoalsNeedingAttention,
    checkAllDependencies,
    archiveOldGoals,
} from '../goals/manager.js';

export function registerGoalsCommands(program: Command) {
    const goals = program.command('goals').description('Long-term goal management');

    // List all goals
    goals
        .command('list')
        .alias('ls')
        .option('-a, --all', 'Show all goals including completed/abandoned')
        .option('-t, --tag <tag>', 'Filter by tag')
        .description('List goals and their progress')
        .action(async (options) => {
            await initDb();
            const overview = await getActiveGoalsOverview();

            if (overview.length === 0) {
                console.log(chalk.dim('\nNo active goals. Create one with: nero goals create\n'));
                return;
            }

            console.log(chalk.bold('\nActive Goals:\n'));

            for (const item of overview) {
                const progressBar = renderProgressBar(item.progress, 20);
                const deadline =
                    item.daysUntilDeadline !== null
                        ? item.daysUntilDeadline < 0
                            ? chalk.red(` ${Math.abs(item.daysUntilDeadline)}d overdue`)
                            : item.daysUntilDeadline <= 7
                              ? chalk.yellow(` ${item.daysUntilDeadline}d left`)
                              : chalk.dim(` ${item.daysUntilDeadline}d left`)
                        : '';

                console.log(`${chalk.bold(item.goal.title)} ${chalk.dim(`#${item.goal.id}`)}`);
                console.log(
                    `  ${progressBar} ${item.progress}% ${chalk.dim(`(${item.tasksDone}/${item.totalTasks} tasks)`)}${deadline}`,
                );
                if (item.currentMilestone) {
                    console.log(chalk.dim(`  → ${item.currentMilestone}`));
                }
                console.log();
            }
        });

    // Create a new goal
    goals
        .command('create')
        .description('Create a new goal with milestones and tasks')
        .action(async () => {
            console.log(chalk.bold('\nCreate a new goal\n'));
            console.log(chalk.dim('Interactive goal creation coming soon.'));
            console.log(chalk.dim('For now, use the JavaScript API directly:\n'));
            console.log(chalk.cyan(`import { createGoal } from './goals/manager.js';`));
            console.log(chalk.cyan(`await createGoal({`));
            console.log(chalk.cyan(`  title: 'My Goal',`));
            console.log(chalk.cyan(`  description: '...',`));
            console.log(chalk.cyan(`  priority: 1,`));
            console.log(chalk.cyan(`  milestones: [...]`));
            console.log(chalk.cyan(`});`));
            console.log();
        });

    // Show detailed progress for a goal
    goals
        .command('show <id>')
        .description('Show detailed progress for a goal')
        .action(async (id) => {
            await initDb();
            const goalId = parseInt(id, 10);
            if (isNaN(goalId)) {
                console.log(chalk.red('Invalid goal ID'));
                return;
            }

            const report = await getProgressReport(goalId);
            if (!report) {
                console.log(chalk.red('Goal not found'));
                return;
            }

            const g = report.goal;

            console.log(chalk.bold(`\n${g.title}`));
            console.log(chalk.dim(g.description));
            console.log();

            // Status line
            const status =
                g.status === 'active'
                    ? chalk.green('active')
                    : g.status === 'completed'
                      ? chalk.green('completed')
                      : g.status === 'paused'
                        ? chalk.yellow('paused')
                        : chalk.red(g.status);
            console.log(`Status: ${status}`);
            console.log(`Priority: ${chalk.cyan(g.priority)}`);
            if (g.deadline) {
                const days = g.daysUntilDeadline;
                const deadlineStr =
                    days !== null && days < 0
                        ? chalk.red(`${Math.abs(days)} days overdue`)
                        : days !== null
                          ? chalk.cyan(`${days} days remaining`)
                          : chalk.cyan(g.deadline.toDateString());
                console.log(`Deadline: ${deadlineStr}`);
            }
            console.log(`Tags: ${g.tags.length > 0 ? g.tags.join(', ') : chalk.dim('none')}`);
            console.log();

            // Progress
            console.log(
                `Progress: ${renderProgressBar(report.summary.overallProgress, 30)} ${report.summary.overallProgress}%`,
            );
            console.log(
                `Tasks: ${report.summary.completedTasks}/${report.summary.totalTasks} complete`,
            );
            console.log(
                `Hours: ${report.summary.totalHoursActual.toFixed(1)}/${report.summary.totalHoursEstimated.toFixed(1)} tracked`,
            );
            console.log();

            // Milestones
            console.log(chalk.bold('Milestones:\n'));
            for (const m of report.milestones) {
                const status =
                    m.status === 'completed'
                        ? chalk.green('✓')
                        : m.status === 'in_progress'
                          ? chalk.yellow('▶')
                          : m.status === 'blocked'
                            ? chalk.red('✗')
                            : chalk.dim('○');
                console.log(`  ${status} ${m.title} ${chalk.dim(`#${m.id}`)}`);
                if (m.description) {
                    console.log(chalk.dim(`      ${m.description}`));
                }

                // Tasks for this milestone
                const tasks = report.tasks.filter((t) => t.milestone_id === m.id);
                if (tasks.length > 0) {
                    for (const t of tasks) {
                        const tStatus =
                            t.status === 'completed'
                                ? chalk.green('✓')
                                : t.status === 'in_progress'
                                  ? chalk.yellow('▶')
                                  : t.status === 'blocked'
                                    ? chalk.red('✗')
                                    : chalk.dim('○');
                        const priority =
                            t.priority === 'urgent'
                                ? chalk.red('!')
                                : t.priority === 'high'
                                  ? chalk.yellow('‼')
                                  : ' ';
                        const auto = t.autonomy_eligible ? chalk.dim(' [auto]') : '';
                        console.log(`      ${tStatus} ${t.title}${priority}${auto}`);
                    }
                }
            }
            console.log();

            // Next action
            if (report.nextActionableTask) {
                console.log(chalk.bold('Next Action:'));
                console.log(chalk.cyan(`  → ${report.nextActionableTask.title}`));
                console.log();
            }

            // Blocked items
            if (report.blockedItems.length > 0) {
                console.log(chalk.bold(chalk.red('Blocked Items:')));
                for (const item of report.blockedItems) {
                    console.log(chalk.red(`  • ${item.type} #${item.id}: ${item.reason}`));
                }
                console.log();
            }
        });

    // Complete a milestone and advance
    goals
        .command('advance <goalId>')
        .description('Mark current milestone complete and advance to next')
        .action(async (goalId) => {
            await initDb();
            const id = parseInt(goalId, 10);
            if (isNaN(id)) {
                console.log(chalk.red('Invalid goal ID'));
                return;
            }

            const result = await advanceMilestone(id);
            if (result.success) {
                console.log(chalk.green(result.message));
            } else {
                console.log(chalk.yellow(result.message));
            }
        });

    // Get autonomy-eligible tasks
    goals
        .command('autonomy')
        .alias('auto')
        .description('Show tasks Nero can work on autonomously')
        .action(async () => {
            await initDb();
            const tasks = await getAutonomyTasks();

            if (tasks.length === 0) {
                console.log(chalk.dim('\nNo autonomy-eligible tasks available.\n'));
                return;
            }

            console.log(chalk.bold('\nAutonomy-Eligible Tasks:\n'));

            for (const t of tasks) {
                const priority =
                    t.priority === 'urgent'
                        ? chalk.red('URGENT')
                        : t.priority === 'high'
                          ? chalk.yellow('HIGH')
                          : chalk.dim(t.priority.toUpperCase());
                console.log(`${chalk.bold(t.title)} ${priority}`);
                if (t.description) {
                    console.log(chalk.dim(`  ${t.description}`));
                }
                if (t.estimated_hours) {
                    console.log(chalk.dim(`  Estimated: ${t.estimated_hours}h`));
                }
                console.log();
            }
        });

    // Check dependencies
    goals
        .command('check')
        .description('Check and update all dependency status')
        .action(async () => {
            await initDb();
            console.log(chalk.dim('Checking dependencies...'));
            const result = await checkAllDependencies();
            console.log(chalk.green(`✓ ${result.unblockedMilestones} milestones unblocked`));
            console.log(chalk.green(`✓ ${result.unblockedTasks} tasks unblocked`));
            if (result.newlyBlocked > 0) {
                console.log(chalk.yellow(`⚠ ${result.newlyBlocked} newly blocked`));
            }
        });

    // Show goals needing attention
    goals
        .command('attention')
        .description('Show goals that need attention (overdue, blocked, stuck)')
        .action(async () => {
            await initDb();
            const attention = await getGoalsNeedingAttention();

            if (attention.length === 0) {
                console.log(chalk.green('\nAll goals on track! No attention needed.\n'));
                return;
            }

            console.log(chalk.bold(chalk.red('\nGoals Needing Attention:\n')));

            for (const item of attention) {
                console.log(chalk.bold(item.goal.title));
                for (const issue of item.issues) {
                    const icon =
                        issue.type === 'overdue' ? '⏰' : issue.type === 'blocked' ? '🚫' : '⏳';
                    const color =
                        issue.type === 'overdue'
                            ? chalk.red
                            : issue.type === 'blocked'
                              ? chalk.yellow
                              : chalk.yellow;
                    console.log(color(`  ${icon} ${issue.details}`));
                }
                console.log();
            }
        });

    // Archive old goals
    goals
        .command('archive')
        .option('-d, --days <number>', 'Archive goals older than N days', '30')
        .description('Archive completed goals older than specified days')
        .action(async (options) => {
            await initDb();
            const days = parseInt(options.days, 10);
            if (isNaN(days) || days < 1) {
                console.log(chalk.red('Invalid days value'));
                return;
            }

            const count = await archiveOldGoals(days);
            console.log(chalk.green(`Archived ${count} completed goal(s) older than ${days} days`));
        });

    // Pause a goal
    goals
        .command('pause <id>')
        .description('Pause a goal')
        .action(async (id) => {
            await initDb();
            const goalId = parseInt(id, 10);
            if (isNaN(goalId)) {
                console.log(chalk.red('Invalid goal ID'));
                return;
            }

            const goal = await Goal.getById(goalId);
            if (!goal) {
                console.log(chalk.red('Goal not found'));
                return;
            }

            await goal.pause();
            console.log(chalk.yellow(`Goal "${goal.title}" paused`));
        });

    // Resume a goal
    goals
        .command('resume <id>')
        .description('Resume a paused goal')
        .action(async (id) => {
            await initDb();
            const goalId = parseInt(id, 10);
            if (isNaN(goalId)) {
                console.log(chalk.red('Invalid goal ID'));
                return;
            }

            const goal = await Goal.getById(goalId);
            if (!goal) {
                console.log(chalk.red('Goal not found'));
                return;
            }

            await goal.resume();
            console.log(chalk.green(`Goal "${goal.title}" resumed`));
        });

    // Complete a goal
    goals
        .command('complete <id>')
        .description('Mark a goal as completed')
        .action(async (id) => {
            await initDb();
            const goalId = parseInt(id, 10);
            if (isNaN(goalId)) {
                console.log(chalk.red('Invalid goal ID'));
                return;
            }

            const goal = await Goal.getById(goalId);
            if (!goal) {
                console.log(chalk.red('Goal not found'));
                return;
            }

            await goal.complete();
            console.log(chalk.green(`🎉 Goal "${goal.title}" completed!`));
        });
}

function renderProgressBar(percent: number, width: number): string {
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    if (percent === 100) {
        return chalk.green(bar);
    } else if (percent >= 70) {
        return chalk.cyan(bar);
    } else if (percent >= 40) {
        return chalk.yellow(bar);
    } else {
        return chalk.red(bar);
    }
}
