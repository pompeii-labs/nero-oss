import { getLux, unwrap } from '../lux/client';
import type { Compaction } from '../lux/types';

export interface CompactionRow {
    id: string;
    summary: string;
    /** Watermark = id of the last folded message. Rows with id <= through_at
     *  are represented by `summary`; the session only loads id > through_at. */
    through_at: number;
    created_at: number;
}

function coerce(raw: Compaction): CompactionRow {
    return {
        id: raw.id,
        summary: raw.summary ?? '',
        through_at: raw.through_at ?? 0,
        created_at: raw.created_at ?? 0,
    };
}

/** Latest compaction summary, or null if the thread has never been folded. */
export async function getLatest(): Promise<CompactionRow | null> {
    const q = getLux()
        .table('compaction')
        .select()
        .order('created_at', { ascending: false })
        .limit(1);
    const rows = unwrap(await q) as Compaction[];
    return rows.length ? coerce(rows[0]) : null;
}

/**
 * Record a fold. We append a new row (cheap, single-user) rather than mutate;
 * `getLatest` returns the newest, so the most recent fold always wins.
 */
export async function create(input: {
    summary: string;
    throughAt: number;
}): Promise<CompactionRow> {
    const res = await getLux()
        .table('compaction')
        .insert({ summary: input.summary, through_at: input.throughAt } as never);
    return coerce(unwrap(res) as Compaction);
}
