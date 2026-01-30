import { db, isDbConnected } from '../db/index.js';
import { Model } from './base.js';

export interface MemoryData {
    id: number;
    body: string;
    related_to: number[];
    category: string | null;
    created_at: Date;
}

export class Memory extends Model<MemoryData> implements MemoryData {
    declare body: string;
    declare related_to: number[];
    declare category: string | null;
    declare created_at: Date;

    static override tableName = 'memories';

    static async getRecent(limit: number): Promise<Memory[]> {
        return Memory.list({
            orderBy: { column: 'created_at', direction: 'DESC' },
            limit,
        });
    }

    static async getCore(): Promise<Memory[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM memories
             WHERE category = 'core'
             ORDER BY created_at DESC`,
        );

        return rows.map((row) => new Memory(row));
    }

    static async getRecentNonCore(limit: number): Promise<Memory[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM memories
             WHERE category IS NULL OR category != 'core'
             ORDER BY created_at DESC
             LIMIT $1`,
            [limit],
        );

        return rows.map((row) => new Memory(row));
    }
}
