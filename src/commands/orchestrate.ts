import { Command } from 'commander';
import chalk from 'chalk';
import { getDirector, type OrchestrationSession } from '../orchestration/index.js';

export function registerOrchestrationCommands(program: Command): void {
    const orch = program
        .command('orchestrate')
        .description('Multi-agent orchestration for complex tasks');

    orch.command('start <goal>')
        .description('Start a new orchestrated session for a complex goal')
        .option('-p, --parallel', 'Execute tasks in parallel', true)
        .option('-s, --sequential', 'Execute tasks sequentially')
        .action(async (goal: string, options) => {
            console.log(chalk.blue('🎼 Starting orchestration...'));
            console.log(chalk.dim(`Goal: ${goal}`));
            console.log();

            const director = getDirector({
                parallelExecution: !options.sequential,
            });

            try {
                const session = await director.orchestrate(goal);

                console.log(chalk.green('✓ Orchestration complete!'));
                console.log();
                console.log(director.getSessionSummary(session.id));
            } catch (error) {
                console.error(chalk.red('✗ Orchestration failed:'), error);
                process.exit(1);
            }
        });

    orch.command('list')
        .description('List all orchestration sessions')
        .action(() => {
            const director = getDirector();
            const sessions = director.getAllSessions();

            if (sessions.length === 0) {
                console.log(chalk.yellow('No active sessions'));
                return;
            }

            console.log(chalk.bold('\nActive Sessions:'));
            console.log();

            for (const session of sessions) {
                const statusColor = {
                    planning: chalk.yellow,
                    executing: chalk.blue,
                    completed: chalk.green,
                    failed: chalk.red,
                }[session.status];

                console.log(
                    `  ${chalk.dim(session.id.slice(0, 8))}  ${statusColor(session.status.padEnd(10))}  ${session.goal.slice(0, 50)}${session.goal.length > 50 ? '...' : ''}`,
                );
            }

            console.log();
        });

    orch.command('show <sessionId>')
        .description('Show detailed information about a session')
        .action((sessionId: string) => {
            const director = getDirector();
            const summary = director.getSessionSummary(sessionId);

            if (summary === 'Session not found') {
                console.log(chalk.red('Session not found'));
                process.exit(1);
            }

            console.log(summary);
        });

    orch.command('demo')
        .description('Run a demo orchestration')
        .action(async () => {
            console.log(chalk.blue('🎼 Running demo orchestration...'));
            console.log();

            const director = getDirector();

            const goal = 'Build a simple REST API with user authentication';
            console.log(chalk.dim(`Demo goal: ${goal}`));
            console.log();

            const session = await director.orchestrate(goal);

            console.log(chalk.green('✓ Demo complete!'));
            console.log();
            console.log(director.getSessionSummary(session.id));
        });
}
