import { db, isDbConnected } from '../db/index.js';
import { Model } from './base.js';

export interface SummaryData {
    id: number;
    content: string;
    covers_until: Date;
    token_estimate: number | null;
    session_start: Date | null;
    is_session_summary: boolean;
    message_count: number | null;
    created_at: Date;
}

export class Summary extends Model<SummaryData> implements SummaryData {
    declare content: string;
    declare covers_until: Date;
    declare token_estimate: number | null;
    declare session_start: Date | null;
    declare is_session_summary: boolean;
    declare message_count: number | null;
    declare created_at: Date;

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

    static async getRecentSessionSummaries(limit: number): Promise<Summary[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM summaries
             WHERE is_session_summary = TRUE
             ORDER BY created_at DESC
             LIMIT $1`,
            [limit],
        );

        return rows.map((row) => new Summary(row));
    }

    static async getLatestSessionSummary(): Promise<Summary | null> {
        if (!isDbConnected()) return null;

        const { rows } = await db.query(
            `SELECT * FROM summaries
             WHERE is_session_summary = TRUE
             ORDER BY created_at DESC
             LIMIT 1`,
        );

        return rows[0] ? new Summary(rows[0]) : null;
    }

    static async getLatestNonSession(): Promise<Summary | null> {
        if (!isDbConnected()) return null;

        const { rows } = await db.query(
            `SELECT * FROM summaries
             WHERE is_session_summary = FALSE OR is_session_summary IS NULL
             ORDER BY created_at DESC
             LIMIT 1`,
        );

        return rows[0] ? new Summary(rows[0]) : null;
    }

    static async createSessionSummary(params: {
        content: string;
        sessionStart: Date;
        sessionEnd: Date;
        messageCount: number;
        tokenEstimate?: number;
    }): Promise<Summary> {
        return Summary.create({
            content: params.content,
            covers_until: params.sessionEnd,
            token_estimate: params.tokenEstimate ?? null,
            session_start: params.sessionStart,
            is_session_summary: true,
            message_count: params.messageCount,
        });
    }
}
