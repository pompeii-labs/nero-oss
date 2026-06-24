import { describe, test, expect, afterAll } from 'bun:test';
import { startDispatch, isActive, type RunnableAgent } from '../src/harness/dispatch';
import * as dispatches from '../src/data/dispatches';
import { getLux } from '../src/lux/client';
import type { Messages } from '../src/lux/types';

const HAS_LUX = Boolean(process.env.LUX_SECRET_KEY && process.env.LUX_URL);
const d = HAS_LUX ? describe : describe.skip;

/** Fake agent: drives the callbacks the dispatcher wires up, then returns a
 *  final message. Exercises dispatch orchestration without Magma. */
function makeFakeAgent(finalText: string): RunnableAgent {
    const a: RunnableAgent = {
        currentMemories: '',
        async setup() {},
        beginRun() {},
        addMessage() {},
        endRun() {},
        kill() {},
        async main() {
            a.onActivity?.({
                id: 'act1',
                status: 'running',
                details: {
                    display_name: 'Search',
                    fn_name: 'search',
                    args: { q: 'x' },
                    result: null,
                },
            });
            a.onActivity?.({
                id: 'act1',
                status: 'success',
                details: {
                    display_name: 'Search',
                    fn_name: 'search',
                    args: { q: 'x' },
                    result: 'found',
                },
            });
            return { content: finalText };
        },
    };
    return a;
}

const created: string[] = [];

d('dispatch round-trip', () => {
    afterAll(async () => {
        if (!HAS_LUX) return;
        for (const id of created) {
            await getLux().table('messages').delete().eq('dispatch_id', id);
            await getLux().table('dispatches').delete().eq('id', id);
        }
    });

    test('persists trigger + assistant, records activity, ends done', async () => {
        const handle = await startDispatch(
            { text: 'hi nero' },
            { agentFactory: () => makeFakeAgent('Hello world') },
        );
        created.push(handle.dispatchId);
        expect(handle.steered).toBe(false);

        await handle.done;
        expect(isActive()).toBe(false);

        const row = await dispatches.get(handle.dispatchId);
        expect(row!.status).toBe('done');
        const act = row!.activities.find((a) => a.id === 'act1');
        expect(act?.status).toBe('success');

        const rows = (await getLux()
            .table('messages')
            .select()
            .eq('dispatch_id', handle.dispatchId)
            .order('id', { ascending: true })) as { data: Messages[] };
        const user = rows.data.find((m) => m.role === 'user');
        const assistant = rows.data.find((m) => m.type === 'agent_text');
        expect(user?.content).toBe('hi nero');
        expect(assistant?.content).toBe('Hello world');
    });

    test('a mid-run message is queued, folded after the response, in order', async () => {
        let release: () => void = () => {};
        const gate = new Promise<void>((r) => (release = r));
        let calls = 0;
        const fake: RunnableAgent = {
            currentMemories: '',
            async setup() {},
            beginRun() {},
            addMessage() {},
            endRun() {},
            kill() {},
            async main() {
                calls += 1;
                if (calls === 1) await gate; // hold answer 1 until we've steered
                return { content: `answer ${calls}` };
            },
        };

        const h = await startDispatch({ text: 'first q' }, { agentFactory: () => fake });
        created.push(h.dispatchId);

        // steer while answer 1 is held
        const s = await startDispatch({ text: 'and also this' });
        expect(s.steered).toBe(true);
        expect(s.dispatchId).toBe(h.dispatchId);

        release();
        await h.done;

        const rows = (await getLux()
            .table('messages')
            .select()
            .eq('dispatch_id', h.dispatchId)
            .order('id', { ascending: true })) as { data: Messages[] };
        const seq = rows.data.map((m) => `${m.role}/${m.type}:${m.content}`);
        expect(seq).toEqual([
            'user/message:first q',
            'assistant/agent_text:answer 1',
            'user/message:and also this',
            'assistant/agent_text:answer 2',
        ]);
    });
});
