import { db, isDbConnected } from '../db/index.js';
import { Model } from './base.js';
import { computeNextRun, parseRecurrence, type RecurrenceRule } from '../actions/recurrence.js';

export interface ActionData {
    id: number;
    request: string;
    timestamp: Date;
    recurrence: string | null;
    steps: string[];
    enabled: boolean;
    last_run: Date | null;
    created_at: Date;
}

export class Action extends Model<ActionData> implements ActionData {
    declare request: string;
    declare timestamp: Date;
    declare recurrence: string | null;
    declare steps: string[];
    declare enabled: boolean;
    declare last_run: Date | null;
    declare created_at: Date;

    static override tableName = 'actions';

    getRecurrenceRule(): RecurrenceRule | null {
        return parseRecurrence(this.recurrence);
    }

    static async getUpcoming(): Promise<Action[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM actions WHERE enabled = true AND timestamp > NOW() ORDER BY timestamp ASC`,
        );

        return rows.map((row) => new Action(row));
    }

    static async getDue(): Promise<Action[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM actions WHERE enabled = true AND timestamp <= NOW() ORDER BY timestamp ASC`,
        );

        return rows.map((row) => new Action(row));
    }

    static async getAll(): Promise<Action[]> {
        return Action.list({
            orderBy: { column: 'timestamp', direction: 'ASC' },
        });
    }

    async reschedule(): Promise<boolean> {
        const rule = this.getRecurrenceRule();
        if (!rule) return false;

        const nextTimestamp = computeNextRun(this.timestamp, rule);
        await this.update({ timestamp: nextTimestamp } as any);
        return true;
    }
}
