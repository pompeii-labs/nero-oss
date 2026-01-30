import { db, isDbConnected } from '../db/index.js';
import { Message } from '../models/message.js';
import { Summary } from '../models/summary.js';
import { getTimeSinceMinutes } from '../util/temporal.js';

export interface SessionInfo {
    isNewSession: boolean;
    currentSessionStart: Date | null;
    lastMessageTime: Date | null;
    gapMinutes: number;
}

export interface UnsummarizedSession {
    start: Date;
    end: Date;
    messages: Message[];
}

export class SessionService {
    constructor(private gapThresholdMinutes: number = 30) {}

    async detectSession(): Promise<SessionInfo> {
        if (!isDbConnected()) {
            return {
                isNewSession: false,
                currentSessionStart: null,
                lastMessageTime: null,
                gapMinutes: 0,
            };
        }

        const lastMessage = await this.getLastMessageTime();
        if (!lastMessage) {
            return {
                isNewSession: true,
                currentSessionStart: new Date(),
                lastMessageTime: null,
                gapMinutes: 0,
            };
        }

        const gapMinutes = getTimeSinceMinutes(lastMessage);
        const isNewSession = gapMinutes >= this.gapThresholdMinutes;

        return {
            isNewSession,
            currentSessionStart: isNewSession ? new Date() : await this.findCurrentSessionStart(),
            lastMessageTime: lastMessage,
            gapMinutes,
        };
    }

    async findCurrentSessionStart(): Promise<Date | null> {
        if (!isDbConnected()) return null;

        const { rows } = await db.query(
            `WITH message_gaps AS (
                SELECT
                    created_at,
                    LAG(created_at) OVER (ORDER BY created_at DESC) as prev_created_at,
                    EXTRACT(EPOCH FROM (LAG(created_at) OVER (ORDER BY created_at DESC) - created_at)) / 60 as gap_minutes
                FROM messages
                WHERE role IN ('user', 'assistant')
                ORDER BY created_at DESC
            )
            SELECT created_at
            FROM message_gaps
            WHERE gap_minutes >= $1 OR prev_created_at IS NULL
            ORDER BY created_at DESC
            LIMIT 1`,
            [this.gapThresholdMinutes],
        );

        if (rows.length === 0) {
            const oldest = await db.query(
                `SELECT MIN(created_at) as created_at FROM messages WHERE role IN ('user', 'assistant')`,
            );
            return oldest.rows[0]?.created_at || null;
        }

        return rows[0].created_at;
    }

    async getUnsummarizedPreviousSession(): Promise<UnsummarizedSession | null> {
        if (!isDbConnected()) return null;

        const latestSessionSummary = await Summary.getLatestSessionSummary();
        const coversBefore = latestSessionSummary?.covers_until || new Date(0);

        const { rows: gapRows } = await db.query(
            `WITH ordered_messages AS (
                SELECT
                    id,
                    created_at,
                    LAG(created_at) OVER (ORDER BY created_at ASC) as prev_created_at,
                    EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (ORDER BY created_at ASC))) / 60 as gap_minutes
                FROM messages
                WHERE role IN ('user', 'assistant')
                  AND created_at > $1
                ORDER BY created_at ASC
            )
            SELECT created_at, gap_minutes
            FROM ordered_messages
            WHERE gap_minutes >= $2
            ORDER BY created_at DESC
            LIMIT 1`,
            [coversBefore, this.gapThresholdMinutes],
        );

        if (gapRows.length === 0) {
            return null;
        }

        const sessionBoundary = gapRows[0].created_at;

        const { rows: sessionRows } = await db.query(
            `WITH session_start AS (
                SELECT COALESCE(
                    (SELECT created_at FROM messages
                     WHERE created_at < $1 AND role IN ('user', 'assistant') AND created_at > $2
                     ORDER BY created_at DESC
                     LIMIT 1),
                    $2
                ) as start_time
            )
            SELECT m.*
            FROM messages m, session_start
            WHERE m.created_at > session_start.start_time
              AND m.created_at < $1
              AND m.role IN ('user', 'assistant')
            ORDER BY m.created_at ASC`,
            [sessionBoundary, coversBefore],
        );

        if (sessionRows.length === 0) {
            return null;
        }

        const messages = sessionRows.map((row) => new Message(row));
        const start = messages[0].created_at;
        const end = messages[messages.length - 1].created_at;

        return { start, end, messages };
    }

    async getMessagesSinceSessionStart(sessionStart: Date, limit: number): Promise<Message[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM messages
             WHERE created_at >= $1
               AND role IN ('user', 'assistant')
             ORDER BY created_at DESC
             LIMIT $2`,
            [sessionStart, limit],
        );

        return rows.map((row) => new Message(row)).reverse();
    }

    private async getLastMessageTime(): Promise<Date | null> {
        const { rows } = await db.query(
            `SELECT created_at FROM messages
             WHERE role IN ('user', 'assistant')
             ORDER BY created_at DESC
             LIMIT 1`,
        );

        return rows[0]?.created_at || null;
    }
}
