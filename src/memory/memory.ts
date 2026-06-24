import { embed } from './embed';
import * as memoriesData from '../data/memories';
import type { MemoryRow } from '../data/memories';

const DUPLICATE_SIMILARITY = 0.95; // >= this = same fact, don't re-insert
const RECALL_SIMILARITY_FLOOR = 0.35; // below this = not relevant, abstain

export type RememberResult =
    | { status: 'added'; id: string }
    | { status: 'duplicate'; id: string }
    | { status: 'skipped'; reason: string };

/** Record a grounded fact. Embeds, dedups against a near-identical memory, then
 *  inserts. No-op (skipped) when embeddings are unavailable. */
export async function rememberFact(
    content: string,
    opts: { category?: string | null; type?: string } = {},
): Promise<RememberResult> {
    const body = content.trim();
    if (!body) return { status: 'skipped', reason: 'empty' };

    const embedding = await embed(body);
    if (!embedding) return { status: 'skipped', reason: 'no embedding provider' };

    const dupes = await memoriesData.search(embedding, { k: 1, threshold: DUPLICATE_SIMILARITY });
    if (dupes.length > 0) return { status: 'duplicate', id: dupes[0].id };

    const mem = await memoriesData.create({
        body,
        embedding,
        category: opts.category ?? null,
        type: opts.type ?? 'fact',
    });
    return { status: 'added', id: mem.id };
}

/** Top-K relevant memories for a query; abstains on weak matches. */
export async function recallMemories(query: string, k = 5): Promise<MemoryRow[]> {
    const embedding = await embed(query);
    if (!embedding) return [];
    return memoriesData.search(embedding, { k, threshold: RECALL_SIMILARITY_FLOOR });
}

/** Render recalled memories as a system-prompt block. Framed as fallible notes. */
export function formatMemoriesForPrompt(rows: MemoryRow[]): string {
    if (rows.length === 0) return '';
    const lines = rows.map((m) => `- (${m.type}) ${m.body}`);
    return (
        `## Relevant memories\n` +
        `Notes you recorded earlier. They may be outdated or wrong — treat as hints, verify before relying.\n` +
        lines.join('\n')
    );
}

/** Convenience for the dispatch path: recall + format in one call. */
export async function recallForPrompt(query: string): Promise<string> {
    const rows = await recallMemories(query);
    return formatMemoriesForPrompt(rows);
}
