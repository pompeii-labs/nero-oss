import { describe, test, expect, afterAll } from 'bun:test';
import { Memory } from '../src/models/memory';
import { getLux } from '../src/lib/lux';

describe('formatMemoriesForPrompt', () => {
    test('empty -> empty string', () => {
        expect(Memory.format([])).toBe('');
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
        ] as Memory[];
        const out = Memory.format(rows);
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
    // Unique per run: a brand-new fact can't collide with a leftover embedding from
    // a past run, so the first insert is reliably "added" even if Lux's vector index
    // lags a delete. The nonce also makes recall unambiguous.
    const NONCE = `run-${Date.now()}`;
    const FACT = `The user's favorite color is heliotrope, code ${NONCE}.`;

    afterAll(async () => {
        if (HAS) await getLux().table('memories').delete().eq('body', FACT);
    });

    test('remember then recall by semantic query, and dedup on repeat', async () => {
        const first = await Memory.remember(FACT);
        // Live dependency: if the embedding provider is unavailable this run, skip
        // the assertions rather than fail (same spirit as the Lux-gated skip above).
        if (first.status === 'skipped') {
            console.warn('[memory.test] embeddings unavailable - skipping live assertions');
            return;
        }
        expect(first.status).toBe('added');

        // Lux's vector index is eventually consistent, so poll recall until the new
        // fact is searchable (up to ~3s) before asserting index-dependent behavior.
        let hits: Awaited<ReturnType<typeof Memory.recall>> = [];
        for (let i = 0; i < 20 && !hits.some((m) => m.body === FACT); i++) {
            await Bun.sleep(150);
            hits = await Memory.recall(`what colour does the user like? ${NONCE}`, 5);
        }
        expect(hits.some((m) => m.body === FACT)).toBe(true);

        // Now that it's indexed, a repeat is recognized as a duplicate.
        const dup = await Memory.remember(FACT);
        expect(dup.status).toBe('duplicate');
    });
});
