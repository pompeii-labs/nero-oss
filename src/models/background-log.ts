import { db, isDbConnected } from '../db/index.js';
import { Model } from './base.js';

export interface BackgroundLogData {
    id: number;
    tool: string;
    args_summary: string;
    result_summary: string;
    thinking_run_id: number | null;
    created_at: Date;
}

export class BackgroundLog extends Model<BackgroundLogData> implements BackgroundLogData {
    declare tool: string;
    declare args_summary: string;
    declare result_summary: string;
    declare thinking_run_id: number | null;
    declare created_at: Date;

    static override tableName = 'background_logs';

    static async getRecent(hours: number): Promise<BackgroundLog[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM background_logs WHERE created_at > NOW() - INTERVAL '1 hour' * $1 ORDER BY created_at DESC`,
            [hours],
        );

        return rows.map((row) => new BackgroundLog(row));
    }

    static async deleteOlderThan(days: number): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(
            `DELETE FROM background_logs WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
            [days],
        );
    }

    static async setThinkingRunId(ids: number[], runId: number): Promise<void> {
        if (!isDbConnected() || ids.length === 0) return;

        await db.query(`UPDATE background_logs SET thinking_run_id = $1 WHERE id = ANY($2)`, [
            runId,
            ids,
        ]);
    }
}
