import { db, isDbConnected } from '../db/index.js';
import { Model } from './base.js';
import type { FileRef } from '../files/index.js';

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageMedium = 'terminal' | 'voice' | 'sms' | 'web' | 'cli' | 'api' | 'slack';

export interface MessageData {
    id: number;
    role: MessageRole;
    content: string;
    medium: MessageMedium;
    compacted: boolean;
    attachments: FileRef[] | null;
    created_at: Date;
}

export class Message extends Model<MessageData> implements MessageData {
    declare role: MessageRole;
    declare content: string;
    declare medium: MessageMedium;
    declare compacted: boolean;
    declare attachments: FileRef[] | null;
    declare created_at: Date;

    static override tableName = 'messages';

    static async getRecent(limit: number): Promise<Message[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM messages WHERE compacted = FALSE ORDER BY created_at DESC LIMIT $1`,
            [limit],
        );

        return rows.map((row) => new Message(row));
    }

    static async getUncompacted(): Promise<Message[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM messages WHERE compacted = FALSE ORDER BY created_at ASC`,
        );

        return rows.map((row) => new Message(row));
    }

    static async getSince(timestamp: Date, limit: number): Promise<Message[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM messages WHERE created_at > $1 AND compacted = FALSE ORDER BY created_at DESC LIMIT $2`,
            [timestamp, limit],
        );

        return rows.map((row) => new Message(row));
    }

    static async markAllCompacted(): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(`UPDATE messages SET compacted = TRUE WHERE compacted = FALSE`);
    }
}
