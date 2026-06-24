import { getLux, unwrap } from '../lux/client';
import type { Dispatches } from '../lux/types';

export type DispatchStatus = 'thinking' | 'running' | 'compacting' | 'done' | 'error' | 'cancelled';

export interface DispatchActivity {
    id: string;
    tool: string;
    displayName?: string;
    args?: Record<string, unknown>;
    status: 'running' | 'success' | 'error';
    result?: string;
    error?: string;
}

export interface DispatchRow {
    id: string;
    status: DispatchStatus;
    streaming_text: string;
    activities: DispatchActivity[];
    created_at: number;
    updated_at: number;
}

function coerce(raw: Dispatches): DispatchRow {
    return {
        id: raw.id,
        status: (raw.status as DispatchStatus) ?? 'running',
        streaming_text: raw.streaming_text ?? '',
        activities: (raw.activities as DispatchActivity[] | null) ?? [],
        created_at: raw.created_at ?? 0,
        updated_at: raw.updated_at ?? 0,
    };
}

export async function create(): Promise<DispatchRow> {
    const res = await getLux()
        .table('dispatches')
        .insert({ status: 'thinking', streaming_text: '', activities: [] } as never);
    return coerce(unwrap(res) as Dispatches);
}

export async function update(
    id: string,
    patch: Partial<Pick<DispatchRow, 'status' | 'streaming_text' | 'activities'>>,
): Promise<void> {
    const body: Record<string, unknown> = { ...patch, updated_at: Date.now() };
    unwrap(
        await getLux()
            .table('dispatches')
            .update(body as never)
            .eq('id', id),
    );
}

export async function get(id: string): Promise<DispatchRow | null> {
    const rows = unwrap(
        await getLux().table('dispatches').select().eq('id', id).limit(1),
    ) as Dispatches[];
    return rows.length ? coerce(rows[0]) : null;
}
