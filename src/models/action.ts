import { db, isDbConnected } from '../db/index.js';
import { Model } from './base.js';

export interface ActionData {
    id: number;
    request: string;
    timestamp: Date;
    recurrence: string | null;
    steps: string[];
    created_at: Date;
}

export class Action extends Model<ActionData> implements ActionData {
    request!: string;
    timestamp!: Date;
    recurrence!: string | null;
    steps!: string[];
    created_at!: Date;

    static override tableName = 'actions';

    static async getUpcoming(): Promise<Action[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM actions WHERE timestamp > NOW() ORDER BY timestamp ASC`,
        );

        return rows.map((row) => new Action(row));
    }

    static async getAll(): Promise<Action[]> {
        return Action.list({
            orderBy: { column: 'timestamp', direction: 'ASC' },
        });
    }
}
