import { db, isDbConnected } from '../db/index.js';
import { Model } from './base.js';

export interface ActionRunData {
    id: number;
    action_id: number;
    status: 'running' | 'success' | 'error';
    result: string | null;
    error: string | null;
    started_at: Date;
    completed_at: Date | null;
    duration_ms: number | null;
}

export class ActionRun extends Model<ActionRunData> implements ActionRunData {
    declare action_id: number;
    declare status: 'running' | 'success' | 'error';
    declare result: string | null;
    declare error: string | null;
    declare started_at: Date;
    declare completed_at: Date | null;
    declare duration_ms: number | null;

    static override tableName = 'action_runs';

    static async getByAction(actionId: number, limit = 20): Promise<ActionRun[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM action_runs WHERE action_id = $1 ORDER BY started_at DESC LIMIT $2`,
            [actionId, limit],
        );

        return rows.map((row) => new ActionRun(row));
    }

    static async getRecent(limit = 20): Promise<ActionRun[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM action_runs ORDER BY started_at DESC LIMIT $1`,
            [limit],
        );

        return rows.map((row) => new ActionRun(row));
    }

    static async deleteOlderThan(days: number): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(`DELETE FROM action_runs WHERE started_at < NOW() - INTERVAL '1 day' * $1`, [
            days,
        ]);
    }
}
