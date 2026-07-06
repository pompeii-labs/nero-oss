import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import {
    getContextWindow,
    DEFAULT_CONTEXT,
    __resetContextCache,
} from '../src/services/harness/context';

const realFetch = globalThis.fetch;

function mockRegistry(models: Array<{ id: string; context_length: number }>) {
    globalThis.fetch = mock(
        async () => new Response(JSON.stringify({ data: models }), { status: 200 }),
    ) as unknown as typeof fetch;
}

describe('getContextWindow', () => {
    beforeEach(() => __resetContextCache());
    afterEach(() => {
        globalThis.fetch = realFetch;
        __resetContextCache();
    });

    test('prefers the live registry value', async () => {
        mockRegistry([{ id: 'anthropic/claude-sonnet-4.5', context_length: 555_000 }]);
        expect(await getContextWindow('anthropic/claude-sonnet-4.5')).toBe(555_000);
    });

    test('strips a :variant suffix to match the base slug', async () => {
        mockRegistry([{ id: 'anthropic/claude-sonnet-4.5', context_length: 555_000 }]);
        expect(await getContextWindow('anthropic/claude-sonnet-4.5:nitro')).toBe(555_000);
    });

    test('falls back to the hardcoded map when registry lacks the slug', async () => {
        mockRegistry([{ id: 'some/other-model', context_length: 1000 }]);
        expect(await getContextWindow('anthropic/claude-opus-4.8')).toBe(1_000_000);
    });

    test('falls back to DEFAULT_CONTEXT for a fully unknown slug', async () => {
        mockRegistry([{ id: 'some/other-model', context_length: 1000 }]);
        expect(await getContextWindow('who/knows-9000')).toBe(DEFAULT_CONTEXT);
    });

    test('uses fallback map when the registry fetch fails', async () => {
        globalThis.fetch = mock(async () => {
            throw new Error('network down');
        }) as unknown as typeof fetch;
        expect(await getContextWindow('anthropic/claude-opus-4.8')).toBe(1_000_000);
        expect(await getContextWindow('who/knows-9000')).toBe(DEFAULT_CONTEXT);
    });
});
