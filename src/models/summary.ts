import { db, isDbConnected } from '../db/index.js';
import { Model } from './base.js';

export interface SummaryData {
    id: number;
    content: string;
    covers_until: Date;
    token_estimate: number | null;
    created_at: Date;
}

export class Summary extends Model<SummaryData> implements SummaryData {
    content!: string;
    covers_until!: Date;
    token_estimate!: number | null;
    created_at!: Date;

    static override tableName = 'summaries';

    static async getLatest(): Promise<Summary | null> {
        if (!isDbConnected()) return null;

        const { rows } = await db.query(`SELECT * FROM summaries ORDER BY created_at DESC LIMIT 1`);

        return rows[0] ? new Summary(rows[0]) : null;
    }

    static async getRecent(limit: number): Promise<Summary[]> {
        return Summary.list({
            orderBy: { column: 'created_at', direction: 'DESC' },
            limit,
        });
    }
}
