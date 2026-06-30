import { DataModel } from './datamodel';
import { getLux, unwrap } from '../lib/lux';
import { embed } from '../memory/embed';
import type { Memories } from '../lux/types';

const DUPLICATE_SIMILARITY = 0.95; // >= this = same fact, don't re-insert
const RECALL_SIMILARITY_FLOOR = 0.35; // below this = not relevant, abstain

export type RememberResult =
    | { status: 'added'; id: string }
    | { status: 'duplicate'; id: string }
    | { status: 'skipped'; reason: string };

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

    /** Record a grounded fact. Embeds, dedups against a near-identical memory, then
     *  inserts. No-op (skipped) when embeddings are unavailable. */
    static async remember(
        content: string,
        opts: { category?: string | null; type?: string } = {},
    ): Promise<RememberResult> {
        const body = content.trim();
        if (!body) return { status: 'skipped', reason: 'empty' };
        const embedding = await embed(body);
        if (!embedding) return { status: 'skipped', reason: 'no embedding provider' };
        const dupes = await Memory.search(embedding, { k: 1, threshold: DUPLICATE_SIMILARITY });
        if (dupes.length > 0) return { status: 'duplicate', id: dupes[0].id };
        const mem = await Memory.add({
            body,
            embedding,
            category: opts.category ?? null,
            type: opts.type ?? 'fact',
        });
        return { status: 'added', id: mem.id };
    }

    /** Top-K relevant memories for a query; abstains on weak matches. */
    static async recall(query: string, k = 5): Promise<Memory[]> {
        const embedding = await embed(query);
        if (!embedding) return [];
        return Memory.search(embedding, { k, threshold: RECALL_SIMILARITY_FLOOR });
    }

    /** Render recalled memories as a system-prompt block. Framed as fallible notes. */
    static format(rows: Memory[]): string {
        if (rows.length === 0) return '';
        const lines = rows.map((m) => `- (${m.type}) ${m.body}`);
        return (
            `## Relevant memories\n` +
            `Notes you recorded earlier. They may be outdated or wrong, treat as hints, verify before relying.\n` +
            lines.join('\n')
        );
    }

    /** Convenience for the dispatch path: recall + format in one call. */
    static async recallForPrompt(query: string): Promise<string> {
        return Memory.format(await Memory.recall(query));
    }
}
