import { getLux, unwrap } from '../lux/client';
import type { Messages } from '../lux/types';

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

export interface MessageRow {
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

function coerce(raw: Messages): MessageRow {
    return {
        id: raw.id,
        role: (raw.role as MessageRole) ?? 'user',
        type: (raw.type as MessageType) ?? 'message',
        content: raw.content ?? '',
        metadata: (raw.metadata as Record<string, unknown> | null) ?? null,
        attachments: (raw.attachments as AttachmentRef[] | null) ?? null,
        medium: raw.medium ?? 'web',
        dispatch_id: raw.dispatch_id ?? null,
        created_at: raw.created_at ?? 0,
    };
}

interface InsertInput {
    role: MessageRole;
    type?: MessageType;
    content?: string;
    metadata?: Record<string, unknown> | null;
    attachments?: AttachmentRef[] | null;
    medium?: string;
    dispatchId?: string | null;
}

export async function insert(input: InsertInput): Promise<MessageRow> {
    // JSON columns reject an empty string, so omit metadata/attachments when
    // absent rather than sending null.
    const row: Record<string, unknown> = {
        role: input.role,
        type: input.type ?? 'message',
        content: input.content ?? '',
        medium: input.medium ?? 'web',
    };
    if (input.metadata != null) row.metadata = input.metadata;
    if (input.attachments != null) row.attachments = input.attachments;
    if (input.dispatchId != null) row.dispatch_id = input.dispatchId;
    const res = await getLux()
        .table('messages')
        .insert(row as never);
    return coerce(unwrap(res) as Messages);
}

export function insertUser(
    content: string,
    opts: {
        attachments?: AttachmentRef[] | null;
        dispatchId?: string | null;
        medium?: string;
    } = {},
): Promise<MessageRow> {
    return insert({
        role: 'user',
        type: 'message',
        content,
        attachments: opts.attachments ?? null,
        dispatchId: opts.dispatchId ?? null,
        medium: opts.medium ?? 'web',
    });
}

/** A UI interaction (a panel button press), persisted as a labeled event, NOT a
 *  user message. Nero receives it as `[interaction] ...` context; the chat doesn't
 *  render it as the user talking. */
export function insertInteraction(
    content: string,
    dispatchId?: string | null,
): Promise<MessageRow> {
    return insert({ role: 'user', type: 'interaction', content, dispatchId: dispatchId ?? null });
}

export function insertAgentText(content: string, dispatchId: string): Promise<MessageRow> {
    return insert({ role: 'assistant', type: 'agent_text', content, dispatchId });
}

export function insertToolCall(meta: ToolCallMeta, dispatchId: string): Promise<MessageRow> {
    return insert({
        role: 'assistant',
        type: 'tool_call',
        content: '',
        metadata: meta as unknown as Record<string, unknown>,
        dispatchId,
    });
}

/**
 * Session history in chronological (ascending id) order.
 * - With `since` (a compaction watermark id): all rows after it.
 * - Cold start (no `since`): the most recent `limit` rows, reversed to ascending.
 */
export async function getSessionHistory(
    opts: { since?: number; limit?: number } = {},
): Promise<MessageRow[]> {
    const t = getLux().table('messages');
    if (opts.since != null) {
        let q = t.select().gt('id', opts.since).order('id', { ascending: true });
        if (opts.limit) q = q.limit(opts.limit);
        return (unwrap(await q) as Messages[]).map(coerce);
    }
    const q = t
        .select()
        .order('id', { ascending: false })
        .limit(opts.limit ?? 2000);
    return (unwrap(await q) as Messages[]).map(coerce).reverse();
}

/** Human (user) messages written after `sinceId`, ascending. Drives steering. */
export async function getHumanSince(sinceId: number): Promise<MessageRow[]> {
    const q = getLux()
        .table('messages')
        .select()
        .gt('id', sinceId)
        .eq('role', 'user')
        .eq('type', 'message')
        .order('id', { ascending: true });
    return (unwrap(await q) as Messages[]).map(coerce);
}

export async function getRecent(limit = 50): Promise<MessageRow[]> {
    const q = getLux().table('messages').select().order('id', { ascending: false }).limit(limit);
    return (unwrap(await q) as Messages[]).map(coerce).reverse();
}
