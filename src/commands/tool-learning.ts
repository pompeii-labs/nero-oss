import { Command } from 'commander';
import chalk from 'chalk';
import { initDb, closeDb } from '../db/index.js';
import {
    findSimilarOutputs,
    getToolPatterns,
    getToolSuggestions,
    semanticToolSearch,
    learnToolBehaviors,
    cleanupOldOutputs,
} from '../tool-learning/index.js';

function formatTimeAgo(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
}

export function registerToolLearningCommand(program: Command): void {
    const tools = program
        .command('tool-learning')
        .description('Learn from tool outputs and search past executions');

    tools
        .command('search <query>')
        .description('Search past tool outputs with natural language')
        .option('-t, --tool <name>', 'Filter by specific tool')
        .option('-a, --all', 'Include failed executions', false)
        .option('-d, --days <n>', 'Limit to recent days', '30')
        .option('-l, --limit <n>', 'Max results', '10')
        .action(async (query, options) => {
            try {
                await initDb();

                const since = options.days
                    ? new Date(Date.now() - parseInt(options.days) * 24 * 60 * 60 * 1000)
                    : undefined;

                console.log(chalk.dim(`Searching for: "${query}"...\n`));

                const results = await semanticToolSearch(query, {
                    toolName: options.tool,
                    successOnly: !options.all,
                    since,
                    limit: parseInt(options.limit),
                });

                if (results.length === 0) {
                    console.log(chalk.yellow('No matching tool outputs found'));
                    return;
                }

                console.log(chalk.bold(`Found ${results.length} results:\n`));

                for (const r of results) {
                    const relevanceColor =
                        r.relevance > 80
                            ? chalk.green
                            : r.relevance > 60
                              ? chalk.yellow
                              : chalk.gray;
                    console.log(
                        `${relevanceColor(`[${r.relevance}%]`)} ${chalk.cyan(r.tool_name)}`,
                    );
                    console.log(`  Args: ${r.args.slice(0, 80)}${r.args.length > 80 ? '...' : ''}`);
                    console.log(
                        `  Output: ${r.output.slice(0, 120)}${r.output.length > 120 ? '...' : ''}`,
                    );
                    console.log(`  ${chalk.dim(r.when)}`);
                    console.log();
                }
            } finally {
                await closeDb();
            }
        });

    tools
        .command('patterns [tool]')
        .description('Show learned patterns for a tool (or all tools)')
        .action(async (toolName) => {
            try {
                await initDb();

                if (toolName) {
                    console.log(chalk.bold(`\nPatterns for ${toolName}:\n`));

                    const patterns = await getToolPatterns(toolName, 2);
                    const suggestions = await getToolSuggestions(toolName);

                    if (patterns.length === 0 && suggestions.length === 0) {
                        console.log(chalk.yellow('No patterns learned yet. Use the tool more!'));
                        return;
                    }

                    if (patterns.length > 0) {
                        console.log(chalk.underline('Common argument patterns:'));
                        for (const p of patterns) {
                            console.log(`  ${p.pattern_value} (${p.frequency} uses)`);
                        }
                        console.log();
                    }

                    if (suggestions.length > 0) {
                        console.log(chalk.underline('Suggestions:'));
                        for (const s of suggestions) {
                            const icon =
                                s.type === 'avoid_pattern'
                                    ? '⚠️'
                                    : s.type === 'common_args'
                                      ? '💡'
                                      : '✓';
                            const color = s.type === 'avoid_pattern' ? chalk.yellow : chalk.green;
                            const confPct = Math.round(s.confidence * 100);
                            console.log(`  ${icon} ${color(s.suggestion)}`);
                            console.log(
                                `     ${chalk.dim(`${s.context} (${confPct}% confidence)`)}`,
                            );
                        }
                    }
                } else {
                    console.log(chalk.bold('\nRunning pattern learning across all tools...\n'));
                    await learnToolBehaviors();
                    console.log(chalk.green('Pattern learning complete'));
                }
            } finally {
                await closeDb();
            }
        });

    tools
        .command('similar <query>')
        .description('Find similar past tool outputs')
        .option('-t, --tool <name>', 'Filter by tool name')
        .option('-l, --limit <n>', 'Max results', '5')
        .action(async (query, options) => {
            try {
                await initDb();

                console.log(chalk.dim(`Finding outputs similar to: "${query}"...\n`));

                const results = await findSimilarOutputs(
                    query,
                    options.tool,
                    parseInt(options.limit),
                );

                if (results.length === 0) {
                    console.log(chalk.yellow('No similar outputs found'));
                    return;
                }

                for (const r of results) {
                    const simPct = Math.round(r.similarity * 100);
                    const simColor =
                        simPct > 80 ? chalk.green : simPct > 60 ? chalk.yellow : chalk.gray;
                    console.log(`${simColor(`[${simPct}% similar]`)} ${chalk.cyan(r.tool_name)}`);
                    console.log(`  Args: ${r.args_preview.slice(0, 80)}`);
                    console.log(`  ${chalk.dim(formatTimeAgo(r.created_at))}`);
                    console.log();
                }
            } finally {
                await closeDb();
            }
        });

    tools
        .command('cleanup')
        .description('Remove old tool output records')
        .option('-d, --days <n>', 'Keep records from last N days', '30')
        .action(async (options) => {
            try {
                await initDb();
                await cleanupOldOutputs(parseInt(options.days));
            } finally {
                await closeDb();
            }
        });
}
