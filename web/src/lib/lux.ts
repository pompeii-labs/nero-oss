import { createBrowserClient, type LuxProjectClient } from '@luxdb/sdk';
import { getServerUrl } from './actions/helpers';

/**
 * Browser-direct Lux client. Bootstraps from the Nero service (/v1/config),
 * signs in anonymously (one persistent anon principal per browser, stored in
 * localStorage), and subscribes to tables via .live(). Reads only; all writes
 * go through the Nero service with the secret key.
 */
let clientPromise: Promise<LuxProjectClient> | null = null;

async function getClient(): Promise<LuxProjectClient> {
    if (!clientPromise) {
        clientPromise = (async () => {
            const { luxUrl, luxPublishableKey } = await (
                await fetch(getServerUrl('/v1/config'))
            ).json();
            const lux = createBrowserClient(luxUrl, luxPublishableKey);
            const { data } = await lux.auth.getSession();
            if (!data?.session) await lux.auth.signInAnonymously();
            return lux;
        })();
    }
    return clientPromise;
}

export interface MessageRow {
    id: number;
    role: 'user' | 'assistant' | 'system' | null;
    type: 'message' | 'agent_text' | 'tool_call' | null;
    content: string | null;
    metadata: Record<string, unknown> | null;
    attachments: Array<{ id: string; mime: string; name: string }> | null;
    dispatch_id: string | null;
    created_at: number | null;
}

export interface DispatchRow {
    id: string;
    status: 'thinking' | 'running' | 'compacting' | 'done' | 'error' | 'cancelled' | null;
    streaming_text: string | null;
    activities: Array<{
        id: string;
        tool: string;
        displayName?: string;
        args?: Record<string, unknown>;
        status: 'running' | 'success' | 'error';
        result?: string;
    }> | null;
}

export type Change<T> =
    | { kind: 'snapshot'; rows: T[] }
    | { kind: 'upsert'; row: T }
    | { kind: 'delete'; row: T };

// Lux `.live()` change-feed events still deliver JSON columns as raw strings
// (select/insert decode them as of SDK 2.8.0; the live path does not yet). Parse
// defensively so the UI always gets objects/arrays.
function parseJson<T>(v: unknown): T | null {
    if (v == null) return null;
    if (typeof v === 'string') {
        try {
            return JSON.parse(v) as T;
        } catch {
            return null;
        }
    }
    return v as T;
}

function coerceMessage(r: Record<string, unknown>): MessageRow {
    return {
        ...(r as unknown as MessageRow),
        metadata: parseJson(r.metadata),
        attachments: parseJson(r.attachments),
    };
}

function coerceDispatch(r: Record<string, unknown>): DispatchRow {
    return {
        ...(r as unknown as DispatchRow),
        activities: parseJson(r.activities) ?? [],
    };
}

async function subscribe<T extends object>(
    table: string,
    order: { column: string; asc: boolean },
    coerce: (raw: Record<string, unknown>) => T,
    initial: T[] | null,
    onChange: (c: Change<T>) => void,
): Promise<() => void> {
    const lux = await getClient();
    if (initial) onChange({ kind: 'snapshot', rows: initial });

    const { live, error } = await lux
        .table<T>(table)
        .select()
        .order(order.column, { ascending: order.asc })
        .live();
    if (error || !live) {
        console.error(`[lux] live(${table}) failed:`, error);
        return () => {};
    }
    const c = coerce as (r: unknown) => T;
    live.on('snapshot', (e) => onChange({ kind: 'snapshot', rows: (e.rows ?? []).map(c) }));
    live.on('insert', (e) => e.new && onChange({ kind: 'upsert', row: c(e.new) }));
    live.on('update', (e) => e.new && onChange({ kind: 'upsert', row: c(e.new) }));
    live.on('delete', (e) => e.old && onChange({ kind: 'delete', row: c(e.old) }));
    await live.start();
    return () => void live.unsubscribe();
}

export async function loadMessages(): Promise<MessageRow[]> {
    const lux = await getClient();
    const res = await lux.table('messages').select().order('id', { ascending: true });
    return ((res.data ?? []) as Record<string, unknown>[]).map(coerceMessage);
}

export function subscribeMessages(
    initial: MessageRow[],
    onChange: (c: Change<MessageRow>) => void,
): Promise<() => void> {
    return subscribe<MessageRow>(
        'messages',
        { column: 'id', asc: true },
        coerceMessage,
        initial,
        onChange,
    );
}

export function subscribeDispatches(
    onChange: (c: Change<DispatchRow>) => void,
): Promise<() => void> {
    return subscribe<DispatchRow>(
        'dispatches',
        { column: 'updated_at', asc: true },
        coerceDispatch,
        null,
        onChange,
    );
}
