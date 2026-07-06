import { DataModel } from './datamodel';
import { getLux, unwrap } from '@nero/shared/lux';
import type { Messages } from '@nero/shared/types';

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageType = 'message' | 'agent_text' | 'tool_call' | 'interaction';

export interface ToolCallMeta {
    tool_id: string;
    fn_name: string;
    args: Record<string, unknown>;
    result?: unknown;
    status?: 'running' | 'success' | 'error';
}

export interface AttachmentRef {
    id: string;
    mime: string;
    name: string;
}

export interface MessageData {
    /** Auto-incrementing int PK; also the ordering key and compaction watermark. */
    id: number;
    role: MessageRole;
    type: MessageType;
    content: string;
    metadata: Record<string, unknown> | null;
    attachments: AttachmentRef[] | null;
    medium: string;
    dispatch_id: string | null;
    created_at: number;
}

interface InsertInput {
    role: MessageRole;
    type?: MessageType;
    content?: string;
    metadata?: Record<string, unknown> | null;
    attachments?: AttachmentRef[] | null;
    medium?: string;
    dispatch_id?: string | null;
}

export class Message extends DataModel<MessageData> {
    static readonly tableName = 'messages';

    role!: MessageRole;
    type!: MessageType;
    content!: string;
    metadata!: Record<string, unknown> | null;
    attachments!: AttachmentRef[] | null;
    medium!: string;
    dispatch_id!: string | null;
    created_at!: number;

    constructor(data: MessageData) {
        super();
        Object.assign(this, data);
    }

    /** JSON columns reject an empty string, so omit metadata/attachments when absent
     *  rather than sending null. */
    static async insert(input: InsertInput): Promise<Message> {
        const row: Record<string, unknown> = {
            role: input.role,
            type: input.type ?? 'message',
            content: input.content ?? '',
            medium: input.medium ?? 'web',
        };
        if (input.metadata != null) row.metadata = input.metadata;
        if (input.attachments != null) row.attachments = input.attachments;
        if (input.dispatch_id != null) row.dispatch_id = input.dispatch_id;
        const created = unwrap(
            await getLux()
                .table('messages')
                .insert(row as never),
        ) as Messages;
        return new Message(created as unknown as MessageData);
    }

    static insertUser(
        content: string,
        opts: {
            attachments?: AttachmentRef[] | null;
            dispatch_id?: string | null;
            medium?: string;
        } = {},
    ): Promise<Message> {
        return Message.insert({
            role: 'user',
            type: 'message',
            content,
            attachments: opts.attachments ?? null,
            dispatch_id: opts.dispatch_id ?? null,
            medium: opts.medium ?? 'web',
        });
    }

    /** A UI interaction (a panel button press), persisted as a labeled event, NOT a
     *  user message. Nero receives it as `[interaction] ...` context. */
    static insertInteraction(content: string, dispatchId?: string | null): Promise<Message> {
        return Message.insert({
            role: 'user',
            type: 'interaction',
            content,
            dispatch_id: dispatchId ?? null,
        });
    }

    static insertAgentText(content: string, dispatchId: string): Promise<Message> {
        return Message.insert({
            role: 'assistant',
            type: 'agent_text',
            content,
            dispatch_id: dispatchId,
        });
    }

    static insertToolCall(meta: ToolCallMeta, dispatchId: string): Promise<Message> {
        return Message.insert({
            role: 'assistant',
            type: 'tool_call',
            content: '',
            metadata: meta as unknown as Record<string, unknown>,
            dispatch_id: dispatchId,
        });
    }

    /**
     * Session history in chronological (ascending id) order.
     * - With `since` (a compaction watermark id): all rows after it.
     * - Cold start (no `since`): the most recent `limit` rows, reversed to ascending.
     */
    static async getSessionHistory(
        opts: { since?: number; limit?: number } = {},
    ): Promise<Message[]> {
        const t = getLux().table('messages');
        if (opts.since != null) {
            let q = t.select().gt('id', opts.since).order('id', { ascending: true });
            if (opts.limit) q = q.limit(opts.limit);
            return (unwrap(await q) as Messages[]).map(
                (r) => new Message(r as unknown as MessageData),
            );
        }
        const q = t
            .select()
            .order('id', { ascending: false })
            .limit(opts.limit ?? 2000);
        return (unwrap(await q) as Messages[])
            .map((r) => new Message(r as unknown as MessageData))
            .reverse();
    }

    /** Human (user) messages written after `sinceId`, ascending. Drives steering. */
    static async getHumanSince(sinceId: number): Promise<Message[]> {
        const q = getLux()
            .table('messages')
            .select()
            .gt('id', sinceId)
            .eq('role', 'user')
            .eq('type', 'message')
            .order('id', { ascending: true });
        return (unwrap(await q) as Messages[]).map((r) => new Message(r as unknown as MessageData));
    }

    static async getRecent(limit = 50): Promise<Message[]> {
        const q = getLux()
            .table('messages')
            .select()
            .order('id', { ascending: false })
            .limit(limit);
        return (unwrap(await q) as Messages[])
            .map((r) => new Message(r as unknown as MessageData))
            .reverse();
    }
}
