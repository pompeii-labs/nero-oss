import { db, isDbConnected } from '../db/index.js';
import { Model } from './base.js';

export interface NoteData {
    id: number;
    content: string;
    category: string | null;
    surfaced: boolean;
    created_at: Date;
}

export class Note extends Model<NoteData> implements NoteData {
    declare content: string;
    declare category: string | null;
    declare surfaced: boolean;
    declare created_at: Date;

    static override tableName = 'notes';

    static async getUnsurfaced(): Promise<Note[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM notes WHERE surfaced = FALSE ORDER BY created_at ASC`,
        );

        return rows.map((row) => new Note(row));
    }

    static async markSurfaced(ids: number[]): Promise<void> {
        if (!isDbConnected() || ids.length === 0) return;

        await db.query(`UPDATE notes SET surfaced = TRUE WHERE id = ANY($1)`, [ids]);
    }

    static async deleteOlderThan(days: number): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(`DELETE FROM notes WHERE created_at < NOW() - INTERVAL '1 day' * $1`, [
            days,
        ]);
    }
}
