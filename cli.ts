import chalk from 'chalk';
import { initDb, db, migrateDb, closeDb, isDbConnected } from './src/db/index.js';

await initDb();

async function migrations() {
    if (!isDbConnected()) return 'Database not connected';

    const { rows } = await db.query('SELECT * FROM _migrations ORDER BY run_at ASC');

    if (rows.length === 0) return 'No migrations have been run';

    const lines = rows.map(r => `${chalk.dim(r.run_at.toISOString())} ${chalk.cyan(r.name)}`);
    return lines.join('\n');
}

async function messages(...args: string[]) {
    if (!isDbConnected()) return 'Database not connected';

    const limit = parseInt(args[0]) || 20;
    const { rows } = await db.query(
        'SELECT * FROM messages ORDER BY created_at DESC LIMIT $1',
        [limit]
    );

    if (rows.length === 0) return 'No messages found';

    const lines = rows.map(r => {
        const role = r.role === 'user' ? chalk.cyan('user') : chalk.magenta('assistant');
        const content = r.content.length > 80 ? r.content.slice(0, 80) + '...' : r.content;
        return `${chalk.dim(r.created_at.toISOString())} [${role}] ${content}`;
    });
    return lines.join('\n');
}

async function memories(...args: string[]) {
    if (!isDbConnected()) return 'Database not connected';

    const limit = parseInt(args[0]) || 20;
    const { rows } = await db.query(
        'SELECT * FROM memories ORDER BY created_at DESC LIMIT $1',
        [limit]
    );

    if (rows.length === 0) return 'No memories found';

    const lines = rows.map(r => {
        const body = r.body.length > 80 ? r.body.slice(0, 80) + '...' : r.body;
        return `${chalk.dim(r.created_at.toISOString())} ${chalk.yellow(`[${r.id}]`)} ${body}`;
    });
    return lines.join('\n');
}

async function actions() {
    if (!isDbConnected()) return 'Database not connected';

    const { rows } = await db.query(
        'SELECT * FROM actions ORDER BY timestamp ASC'
    );

    if (rows.length === 0) return 'No scheduled actions';

    const now = new Date();
    const lines = rows.map(r => {
        const isPast = new Date(r.timestamp) < now;
        const status = isPast ? chalk.red('PAST') : chalk.green('PENDING');
        const recur = r.recurrence ? chalk.dim(`(${r.recurrence})`) : '';
        return `${status} ${chalk.dim(r.timestamp)} ${r.request} ${recur}`;
    });
    return lines.join('\n');
}

async function stats() {
    if (!isDbConnected()) return 'Database not connected';

    const tables = ['messages', 'memories', 'actions', '_migrations'];
    const counts: Record<string, number> = {};

    for (const table of tables) {
        const { rows } = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
        counts[table] = parseInt(rows[0].count);
    }

    const lines = Object.entries(counts).map(([table, count]) =>
        `${chalk.cyan(table.padEnd(15))} ${count} rows`
    );
    return lines.join('\n');
}

async function clearMessages() {
    if (!isDbConnected()) return 'Database not connected';

    await db.query('DELETE FROM messages');
    return 'Cleared all messages';
}

async function clearMemories() {
    if (!isDbConnected()) return 'Database not connected';

    await db.query('DELETE FROM memories');
    return 'Cleared all memories';
}

async function clearActions() {
    if (!isDbConnected()) return 'Database not connected';

    await db.query('DELETE FROM actions');
    return 'Cleared all actions';
}

async function clearAll() {
    if (!isDbConnected()) return 'Database not connected';

    await db.query('DELETE FROM messages');
    await db.query('DELETE FROM memories');
    await db.query('DELETE FROM actions');
    return 'Cleared messages, memories, and actions';
}

async function migrate() {
    await migrateDb();
    return 'Migrations complete';
}

async function help() {
    return `
${chalk.bold('Nero CLI')} - Database testing utilities

${chalk.cyan('Commands:')}
  migrations          List all migrations that have been run
  messages [limit]    List recent messages (default: 20)
  memories [limit]    List recent memories (default: 20)
  actions             List scheduled actions
  stats               Show row counts for all tables
  clear:messages      Delete all messages
  clear:memories      Delete all memories
  clear:actions       Delete all actions
  clear:all           Delete all data (messages, memories, actions)
  migrate             Run pending migrations
  help                Show this help message

${chalk.dim('Usage: bun cli.ts <command> [args]')}
`;
}

async function sandbox(...args: string[]) {
    const query = args[0] || '';

    const result = await db.query(query);
    console.log(result.rows);

    return '';
}

const cliFunctions: Record<string, (...args: string[]) => Promise<string>> = {
    migrations,
    messages,
    memories,
    actions,
    stats,
    'clear:messages': clearMessages,
    'clear:memories': clearMemories,
    'clear:actions': clearActions,
    'clear:all': clearAll,
    migrate,
    help,
    sandbox,
};

(async () => {
    try {
        const cmd = process.argv[2] || 'help';

        if (!cliFunctions[cmd]) {
            console.error(chalk.red(`Unknown command: ${cmd}`));
            console.log(await help());
            process.exit(1);
        }

        const response = await cliFunctions[cmd](...process.argv.slice(3));
        if (response) {
            if (cmd !== 'help') {
                console.log(chalk.cyan(`${chalk.bold(cmd)}:`));
            }
            console.log(response);
        }
    } catch (error) {
        console.error(chalk.red((error as Error).message || error));
        await closeDb();
        process.exit(1);
    } finally {
        await closeDb();
        process.exit(0);
    }
})();
