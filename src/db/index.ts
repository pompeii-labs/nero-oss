import pg from 'pg';
import chalk from 'chalk';
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

let pool: pg.Pool | null = null;

export const db = {
    async query(text: string, params?: any[]): Promise<pg.QueryResult> {
        if (!pool) {
            throw new Error('Database not initialized. Call initDb() first.');
        }
        return pool.query(text, params);
    },

    async getClient(): Promise<pg.PoolClient> {
        if (!pool) {
            throw new Error('Database not initialized. Call initDb() first.');
        }
        return pool.connect();
    },
};

export async function initDb(): Promise<void> {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
        console.log(chalk.yellow('[db] No DATABASE_URL set, running without persistence'));
        pool = null;
        return;
    }

    pool = new Pool({ connectionString });

    try {
        await pool.query('SELECT 1');
        console.log(chalk.dim('[db] Connected to PostgreSQL'));
    } catch (error) {
        const err = error as Error;
        console.error(chalk.red(`[db] Connection failed: ${err.message}`));
        pool = null;
    }
}

export async function migrateDb(): Promise<void> {
    if (!pool) {
        await initDb();
    }

    if (!pool) {
        console.log(chalk.yellow('[db] Skipping migrations (no database)'));
        return;
    }

    await pool.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            run_at TIMESTAMP DEFAULT NOW()
        )
    `);

    const migrationsDir = join(__dirname, '../../migrations');
    let files: string[];

    try {
        files = await readdir(migrationsDir);
    } catch {
        const altDir = join(process.cwd(), 'migrations');
        files = await readdir(altDir);
    }

    const sqlFiles = files
        .filter(f => f.endsWith('.sql'))
        .sort();

    const { rows: completed } = await pool.query('SELECT name FROM _migrations');
    const completedSet = new Set(completed.map(r => r.name));

    for (const file of sqlFiles) {
        if (completedSet.has(file)) {
            continue;
        }

        const filePath = join(migrationsDir, file);
        let sql: string;

        try {
            sql = await readFile(filePath, 'utf-8');
        } catch {
            const altPath = join(process.cwd(), 'migrations', file);
            sql = await readFile(altPath, 'utf-8');
        }

        console.log(chalk.dim(`[db] Running migration: ${file}`));
        await pool.query(sql);
        await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
    }

    console.log(chalk.green('[db] Migrations complete'));
}

export async function closeDb(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
    }
}

export function isDbConnected(): boolean {
    return pool !== null;
}
