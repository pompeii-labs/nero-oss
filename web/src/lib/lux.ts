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
    type: 'message' | 'agent_text' | 'tool_call' | 'interaction' | null;
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
    created_at?: number | null;
    updated_at?: number | null;
}

export interface DeviceRow {
    id: string;
    name: string | null;
    kind: string | null;
    screen_w: number | null;
    screen_h: number | null;
    connected: boolean | null;
    last_seen: number | null;
}

export interface PresenceRow {
    id: string;
    device_id: string | null;
}

export interface AskOption {
    label: string;
    description?: string;
}
export interface AskItem {
    question: string;
    header?: string;
    options: AskOption[];
    multi?: boolean;
}
export interface SettingsRow {
    key: string;
    value: string | null;
}

export interface QuestionRow {
    id: string;
    items: AskItem[] | null;
    answers: (string[] | null)[] | null;
    status: 'pending' | 'answered' | 'cancelled' | 'timeout' | null;
    created_at?: number | null;
}

export interface ProjectRow {
    id: string;
    title: string | null;
    goal: string | null;
    status:
        | 'planning'
        | 'awaiting_approval'
        | 'running'
        | 'paused'
        | 'done'
        | 'error'
        | 'cancelled'
        | null;
    budget_usd: number | null;
    spent_usd: number | null;
    est_cost_usd: number | null;
    model: string | null;
    result: string | null;
    error: string | null;
    created_at?: number | null;
    updated_at?: number | null;
}

export interface ProjectTaskRow {
    id: string;
    project_id: string | null;
    idx: number | null;
    title: string | null;
    description: string | null;
    depends_on: number[] | null;
    status: 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'cancelled' | null;
    streaming_text: string | null;
    activities: Array<{
        id: string;
        tool: string;
        displayName?: string;
        status: string;
        result?: string;
    }> | null;
    result: string | null;
    cost_usd: number | null;
    created_at?: number | null;
    updated_at?: number | null;
}

export interface PanelRow {
    id: string;
    device_id: string | null;
    title: string | null;
    x: number | null;
    y: number | null;
    w: number | null;
    h: number | null;
    z: number | null;
    components: unknown[] | null;
    state: Record<string, unknown> | null;
    status: string | null;
    maximized?: boolean | null;
    // Function configs ride along on the row; the browser only reads `everyMs`
    // (to auto-poll). Values/secrets are never here — they inject server-side.
    functions?: Record<string, { everyMs?: number }> | null;
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

export function subscribeDevices(onChange: (c: Change<DeviceRow>) => void): Promise<() => void> {
    return subscribe<DeviceRow>(
        'devices',
        { column: 'last_seen', asc: false },
        (r) => r as unknown as DeviceRow,
        null,
        onChange,
    );
}

export function subscribePresence(onChange: (c: Change<PresenceRow>) => void): Promise<() => void> {
    return subscribe<PresenceRow>(
        'presence',
        { column: 'id', asc: true },
        (r) => r as unknown as PresenceRow,
        null,
        onChange,
    );
}

export function subscribeSettings(onChange: (c: Change<SettingsRow>) => void): Promise<() => void> {
    return subscribe<SettingsRow>(
        'settings',
        { column: 'key', asc: true },
        (r) => r as unknown as SettingsRow,
        null,
        onChange,
    );
}

export function subscribeQuestions(
    onChange: (c: Change<QuestionRow>) => void,
): Promise<() => void> {
    return subscribe<QuestionRow>(
        'questions',
        { column: 'created_at', asc: true },
        (r) => ({
            ...(r as unknown as QuestionRow),
            items: parseJson(r.items) ?? [],
            answers: parseJson(r.answers) ?? null,
        }),
        null,
        onChange,
    );
}

export function subscribeProjects(onChange: (c: Change<ProjectRow>) => void): Promise<() => void> {
    return subscribe<ProjectRow>(
        'projects',
        { column: 'created_at', asc: true },
        (r) => r as unknown as ProjectRow,
        null,
        onChange,
    );
}

export function subscribeProjectTasks(
    onChange: (c: Change<ProjectTaskRow>) => void,
): Promise<() => void> {
    return subscribe<ProjectTaskRow>(
        'project_tasks',
        { column: 'idx', asc: true },
        (r) => ({
            ...(r as unknown as ProjectTaskRow),
            depends_on: parseJson(r.depends_on) ?? [],
            activities: parseJson(r.activities) ?? [],
        }),
        null,
        onChange,
    );
}

export function subscribePanels(onChange: (c: Change<PanelRow>) => void): Promise<() => void> {
    return subscribe<PanelRow>(
        'panels',
        { column: 'z', asc: true },
        (r) => ({
            ...(r as unknown as PanelRow),
            components: parseJson(r.components) ?? [],
            state: parseJson(r.state) ?? {},
            functions: parseJson(r.functions) ?? {},
        }),
        null,
        onChange,
    );
}
