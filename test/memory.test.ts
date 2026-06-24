import { describe, test, expect, afterAll } from 'bun:test';
import { formatMemoriesForPrompt, rememberFact, recallMemories } from '../src/memory/memory';
import type { MemoryRow } from '../src/data/memories';
import { getLux } from '../src/lux/client';

describe('formatMemoriesForPrompt', () => {
    test('empty -> empty string', () => {
        expect(formatMemoriesForPrompt([])).toBe('');
    });

    test('frames memories as fallible hints with type + body', () => {
        const rows = [
            {
                id: '1',
                body: 'likes teal',
                category: null,
                type: 'preference',
                use_count: 0,
                created_at: 0,
            },
        ] as MemoryRow[];
        const out = formatMemoriesForPrompt(rows);
        expect(out).toContain('Relevant memories');
        expect(out).toContain('verify before relying');
        expect(out).toContain('(preference) likes teal');
    });
});

const HAS = Boolean(
    process.env.LUX_SECRET_KEY && process.env.LUX_URL && process.env.OPENROUTER_API_KEY,
);
const d = HAS ? describe : describe.skip;

d('memory recall (live: OpenRouter embeddings + Lux vectors)', () => {
    const FACT = "The user's favorite color is teal and they keep bees.";

    afterAll(async () => {
        if (!HAS) return;
        await getLux().table('memories').delete().eq('body', FACT);
    });

    test('remember then recall by semantic query, and dedup on repeat', async () => {
        const first = await rememberFact(FACT);
        expect(first.status).toBe('added');

        const dup = await rememberFact(FACT);
        expect(dup.status).toBe('duplicate');

        const hits = await recallMemories('what colour does the user like?', 5);
        expect(hits.some((m) => m.body === FACT)).toBe(true);
    });
});
