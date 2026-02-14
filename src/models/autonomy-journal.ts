import { db, isDbConnected } from '../db/index.js';
import { Model } from './base.js';

export interface AutonomyJournalData {
    id: number;
    session_id: string;
    project_id: number | null;
    entry: string;
    tokens_used: number;
    duration_ms: number;
    created_at: Date;
}

export class AutonomyJournal extends Model<AutonomyJournalData> implements AutonomyJournalData {
    declare session_id: string;
    declare project_id: number | null;
    declare entry: string;
    declare tokens_used: number;
    declare duration_ms: number;
    declare created_at: Date;

    static override tableName = 'autonomy_journal';

    static async getRecent(limit: number): Promise<AutonomyJournal[]> {
        return AutonomyJournal.list({
            orderBy: { column: 'created_at', direction: 'DESC' },
            limit,
        });
    }

    static async getBySession(sessionId: string): Promise<AutonomyJournal[]> {
        return AutonomyJournal.list({
            where: { session_id: sessionId } as Partial<AutonomyJournalData>,
            orderBy: { column: 'created_at', direction: 'ASC' },
        });
    }

    static async getTokensToday(): Promise<number> {
        if (!isDbConnected()) return 0;

        const { rows } = await db.query(
            `SELECT COALESCE(SUM(tokens_used), 0) as total FROM autonomy_journal WHERE created_at >= CURRENT_DATE`,
        );

        return parseInt(rows[0].total, 10);
    }

    static async getSessionsToday(): Promise<number> {
        if (!isDbConnected()) return 0;

        const { rows } = await db.query(
            `SELECT COUNT(DISTINCT session_id) as total FROM autonomy_journal WHERE created_at >= CURRENT_DATE`,
        );

        return parseInt(rows[0].total, 10);
    }

    static async deleteOlderThan(days: number): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(
            `DELETE FROM autonomy_journal WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
            [days],
        );
    }

    static async updateSessionMetrics(
        sessionId: string,
        tokensUsed: number,
        durationMs: number,
    ): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(
            `UPDATE autonomy_journal SET tokens_used = $1, duration_ms = $2 WHERE session_id = $3`,
            [tokensUsed, durationMs, sessionId],
        );
    }
}
