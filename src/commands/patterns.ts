import { Command } from 'commander';
import chalk from 'chalk';
import { Pattern, Prediction, PatternEngine } from '../patterns/index.js';
import { loadConfig } from '../config.js';
import { initDb, closeDb } from '../db/index.js';

export function registerPatternsCommand(program: Command): void {
    const patterns = program
        .command('patterns')
        .description('Pattern engine for predictive actions');

    patterns
        .command('list')
        .description('Show detected patterns')
        .option('-a, --active', 'Show only active patterns', false)
        .action(async (options) => {
            try {
                await initDb();

                const patterns = options.active
                    ? await Pattern.list({ where: { status: 'active' } })
                    : await Pattern.list({});

                if (patterns.length === 0) {
                    console.log(chalk.yellow('No patterns detected yet'));
                    return;
                }

                console.log(chalk.bold(`\nDetected Patterns (${patterns.length}):\n`));

                for (const p of patterns) {
                    const statusColor =
                        p.status === 'confirmed'
                            ? chalk.green
                            : p.status === 'active'
                              ? chalk.blue
                              : chalk.gray;

                    console.log(
                        `${statusColor(`[${p.type}]`)} ${chalk.bold(p.trigger)} → ${p.action}`,
                    );
                    console.log(
                        `  Confidence: ${Math.round(p.confidence * 100)}% | Occurrences: ${p.occurrences} | Success rate: ${Math.round(p.successRate * 100)}%`,
                    );
                    if (p.context) {
                        console.log(`  Context: ${p.context}`);
                    }
                    console.log();
                }
            } finally {
                await closeDb();
            }
        });

    patterns
        .command('stats')
        .description('Show pattern engine statistics')
        .action(async () => {
            try {
                await initDb();
                const config = await loadConfig();
                const engine = new PatternEngine(config);
                const stats = await engine.getStats();

                console.log(chalk.bold('\nPattern Engine Statistics\n'));
                console.log(`Total patterns: ${stats.totalPatterns}`);
                console.log(`Active patterns: ${chalk.blue(stats.activePatterns)}`);
                console.log(`Confirmed patterns: ${chalk.green(stats.confirmedPatterns)}`);
                console.log(`Total predictions: ${stats.totalPredictions}`);
                console.log(
                    `Success rate: ${chalk.yellow(`${Math.round(stats.successRate * 100)}%`)}`,
                );
            } finally {
                await closeDb();
            }
        });

    patterns
        .command('analyze')
        .description('Manually run pattern analysis on recent messages')
        .option('-d, --days <n>', 'Days of history to analyze', '7')
        .action(async (options) => {
            try {
                await initDb();
                const config = await loadConfig();
                const engine = new PatternEngine(config);

                console.log(chalk.dim('Running pattern analysis...'));
                const result = await engine.run();

                if (result) {
                    console.log(chalk.green('\n' + result));
                } else {
                    console.log(chalk.yellow('No new patterns detected'));
                }
            } finally {
                await closeDb();
            }
        });

    patterns
        .command('feedback')
        .description('Provide feedback on a suggestion')
        .argument('<id>', 'Prediction ID')
        .argument('<accepted>', 'true or false')
        .action(async (id, accepted) => {
            try {
                await initDb();
                const config = await loadConfig();
                const engine = new PatternEngine(config);

                const boolAccepted = accepted === 'true';
                await engine.recordOutcome(parseInt(id), boolAccepted);

                console.log(
                    chalk.green(
                        `Recorded ${boolAccepted ? 'acceptance' : 'rejection'} for prediction ${id}`,
                    ),
                );
            } finally {
                await closeDb();
            }
        });
}
