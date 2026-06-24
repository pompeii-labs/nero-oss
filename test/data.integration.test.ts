import { describe, test, expect, afterAll } from 'bun:test';
import { getLux } from '../src/lux/client';
import * as messages from '../src/data/messages';
import * as compaction from '../src/data/compaction';

const HAS_LUX = Boolean(process.env.LUX_SECRET_KEY && process.env.LUX_URL);
const d = HAS_LUX ? describe : describe.skip;

const DISPATCH = `test-${Date.now()}`;

d('data layer (Lux)', () => {
    afterAll(async () => {
        if (!HAS_LUX) return;
        await getLux().table('messages').delete().eq('dispatch_id', DISPATCH);
        await getLux().table('compaction').delete().eq('summary', `__test_${DISPATCH}`);
    });

    test('messages insert + ordered session history', async () => {
        const u = await messages.insertUser('hello nero', { dispatchId: DISPATCH });
        const tc = await messages.insertToolCall(
            { tool_id: 't1', fn_name: 'search', args: { q: 'x' }, result: 'ok', status: 'success' },
            DISPATCH,
        );
        const a = await messages.insertAgentText('hi there', DISPATCH);

        expect(typeof u.id).toBe('number');
        expect(tc.id).toBeGreaterThan(u.id);
        expect(a.id).toBeGreaterThan(tc.id);

        const hist = (await messages.getSessionHistory({ since: u.id - 1 })).filter(
            (m) => m.dispatch_id === DISPATCH,
        );
        const ids = hist.map((m) => m.id);
        expect(ids).toEqual([...ids].sort((x, y) => x - y));
        expect(hist.map((m) => m.type)).toEqual(['message', 'tool_call', 'agent_text']);

        const toolRow = hist.find((m) => m.type === 'tool_call')!;
        expect((toolRow.metadata as { fn_name?: string }).fn_name).toBe('search');
    });

    test('getHumanSince returns only user messages after the watermark', async () => {
        const first = await messages.insertUser('first', { dispatchId: DISPATCH });
        await messages.insertAgentText('assistant reply', DISPATCH);
        const second = await messages.insertUser('second', { dispatchId: DISPATCH });

        const humans = (await messages.getHumanSince(first.id)).filter(
            (m) => m.dispatch_id === DISPATCH,
        );
        expect(humans.every((m) => m.role === 'user' && m.type === 'message')).toBe(true);
        expect(humans.some((m) => m.id === second.id)).toBe(true);
        expect(humans.some((m) => m.id === first.id)).toBe(false);
    });

    test('compaction create + getLatest', async () => {
        const created = await compaction.create({ summary: `__test_${DISPATCH}`, throughAt: 42 });
        expect(created.through_at).toBe(42);
        const latest = await compaction.getLatest();
        expect(latest).not.toBeNull();
        expect(latest!.created_at).toBeGreaterThanOrEqual(created.created_at);
    });
});
