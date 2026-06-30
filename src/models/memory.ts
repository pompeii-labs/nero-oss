import { DataModel } from './datamodel';
import { getLux, unwrap } from '../lib/lux';
import type { Memories } from '../lux/types';

export interface MemoryData {
    id: string;
    body: string;
    category: string | null;
    type: string;
    use_count: number;
    created_at: number;
    similarity?: number;
}

const META_COLS = 'id, body, category, type, use_count, created_at';

export class Memory extends DataModel<MemoryData> {
    static readonly tableName = 'memories';

    body!: string;
    category!: string | null;
    type!: string;
    use_count!: number;
    created_at!: number;
    similarity?: number;

    constructor(data: MemoryData) {
        super();
        Object.assign(this, data);
    }

    /** Create a memory with its embedding (not a readable model field). */
    static async add(input: {
        body: string;
        embedding: number[];
        category?: string | null;
        type?: string;
    }): Promise<Memory> {
        const row = unwrap(
            await getLux()
                .table('memories')
                .insert({
                    body: input.body,
                    embedding: input.embedding,
                    category: input.category ?? null,
                    type: input.type ?? 'fact',
                    use_count: 0,
                } as never),
        ) as Memories;
        return new Memory(row as unknown as MemoryData);
    }

    /**
     * Nearest memories to a query embedding. Selects metadata columns only (not the
     * embedding, which reads back as a large string). Relevance/dedup are enforced
     * via the `threshold` option (server-side min cosine similarity).
     */
    static async search(
        embedding: number[],
        opts: { k?: number; threshold?: number } = {},
    ): Promise<Memory[]> {
        const k = opts.k ?? 5;
        const near = opts.threshold != null ? { k, threshold: opts.threshold } : { k };
        const rows = unwrap(
            await getLux()
                .table('memories')
                .select(META_COLS)
                .near('embedding', embedding, near)
                .limit(k),
        ) as Memories[];
        return rows.map((r) => new Memory(r as unknown as MemoryData));
    }

    static async getCore(): Promise<Memory[]> {
        const rows = unwrap(
            await getLux()
                .table('memories')
                .select(META_COLS)
                .eq('category', 'core')
                .order('created_at', { ascending: false }),
        ) as Memories[];
        return rows.map((r) => new Memory(r as unknown as MemoryData));
    }
}
