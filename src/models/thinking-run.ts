import { db, isDbConnected } from '../db/index.js';
import { Model } from './base.js';

export interface ThinkingRunData {
    id: number;
    thought: string;
    surfaced: boolean;
    created_at: Date;
}

export class ThinkingRun extends Model<ThinkingRunData> implements ThinkingRunData {
    declare thought: string;
    declare surfaced: boolean;
    declare created_at: Date;

    static override tableName = 'thinking_runs';

    static async getUnsurfaced(): Promise<ThinkingRun[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM thinking_runs WHERE surfaced = FALSE ORDER BY created_at ASC`,
        );

        return rows.map((row) => new ThinkingRun(row));
    }

    static async getRecent(limit: number): Promise<ThinkingRun[]> {
        return ThinkingRun.list({
            orderBy: { column: 'created_at', direction: 'DESC' },
            limit,
        });
    }

    static async markSurfaced(ids: number[]): Promise<void> {
        if (!isDbConnected() || ids.length === 0) return;

        await db.query(`UPDATE thinking_runs SET surfaced = TRUE WHERE id = ANY($1)`, [ids]);
    }

    static async deleteOlderThan(days: number): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(
            `DELETE FROM thinking_runs WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
            [days],
        );
    }
}
