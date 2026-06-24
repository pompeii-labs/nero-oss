import { getLux, unwrap } from '../lux/client';
import type { Memories } from '../lux/types';

export interface MemoryRow {
    id: string;
    body: string;
    category: string | null;
    type: string;
    use_count: number;
    created_at: number;
    similarity?: number;
}

function coerce(raw: Memories & { similarity?: number }): MemoryRow {
    return {
        id: raw.id,
        body: raw.body ?? '',
        category: raw.category ?? null,
        type: raw.type ?? 'fact',
        use_count: raw.use_count ?? 0,
        created_at: raw.created_at ?? 0,
        similarity: raw.similarity,
    };
}

export async function create(input: {
    body: string;
    embedding: number[];
    category?: string | null;
    type?: string;
}): Promise<MemoryRow> {
    const res = await getLux()
        .table('memories')
        .insert({
            body: input.body,
            embedding: input.embedding,
            category: input.category ?? null,
            type: input.type ?? 'fact',
            use_count: 0,
        } as never);
    return coerce(unwrap(res) as Memories);
}

/**
 * Nearest memories to a query embedding. Selects metadata columns only (not the
 * embedding, which reads back as a large string). Lux doesn't surface a raw
 * similarity score, so relevance/dedup are enforced via the `threshold` option
 * (server-side min cosine similarity).
 */
export async function search(
    embedding: number[],
    opts: { k?: number; threshold?: number } = {},
): Promise<MemoryRow[]> {
    const k = opts.k ?? 5;
    const near = opts.threshold != null ? { k, threshold: opts.threshold } : { k };
    const q = getLux()
        .table('memories')
        .select('id, body, category, type, use_count, created_at')
        .near('embedding', embedding, near)
        .limit(k);
    return (unwrap(await q) as Memories[]).map(coerce);
}

export async function getCore(): Promise<MemoryRow[]> {
    const q = getLux()
        .table('memories')
        .select('id, body, category, type, use_count, created_at')
        .eq('category', 'core')
        .order('created_at', { ascending: false });
    return (unwrap(await q) as Memories[]).map(coerce);
}
