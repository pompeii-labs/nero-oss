import { describe, test, expect, afterAll } from 'bun:test';
import OpenAI from 'openai';
import { NeroAgent } from '../src/services/harness/agent';
import { Dispatcher, type RunnableAgent } from '../src/services/harness/dispatch';
import { Dispatch } from '../src/models/dispatch';
import { getLux } from '../src/lib/lux';
import type { MagmaToolResult } from '@pompeii-labs/magma/types';

const HAS_LUX = Boolean(process.env.LUX_SECRET_KEY && process.env.LUX_URL);
const d = HAS_LUX ? describe : describe.skip;

const stubClient = new OpenAI({ apiKey: 'test-key', baseURL: 'http://localhost:1' });

function fakeResult(id: string): MagmaToolResult {
    return {
        id,
        fn_name: 'noop',
        result: 'ok',
        error: false,
        call: { id, fn_name: 'noop', fn_args: {} },
    };
}

describe('steering hook', () => {
    test('onToolEnd invokes the dispatcher-provided steerCheck', async () => {
        const agent = new NeroAgent({ client: stubClient });
        // no beginRun -> no dispatch id -> skips tool-row persistence (no Lux needed)
        let called = 0;
        agent.steerCheck = async () => {
            called++;
            return true;
        };
        await agent.onToolEnd(fakeResult('t1'));
        expect(called).toBe(1);
    });
});

d('cancellation', () => {
    const created: string[] = [];
    afterAll(async () => {
        for (const id of created) {
            await getLux().table('messages').delete().eq('dispatch_id', id);
            await getLux().table('dispatches').delete().eq('id', id);
        }
    });

    test('cancelling an in-flight dispatch leaves it in cancelled status', async () => {
        let onStarted: () => void = () => {};
        const started = new Promise<void>((r) => (onStarted = r));
        let rejectMain: (e: Error) => void = () => {};

        const agent: RunnableAgent = {
            currentMemories: '',
            async setup() {},
            beginRun() {},
            addMessage() {},
            endRun() {},
            kill() {
                rejectMain(new Error('aborted'));
            },
            main() {
                return new Promise<{ content?: string }>((_, reject) => {
                    rejectMain = reject;
                    onStarted();
                });
            },
        };

        const handle = await Dispatcher.start({ text: 'long task' }, { agentFactory: () => agent });
        created.push(handle.dispatchId);

        await started;
        const cancelledId = await Dispatcher.cancelActive();
        expect(cancelledId).toBe(handle.dispatchId);

        await handle.done;
        const row = await Dispatch.get(handle.dispatchId);
        expect(row?.status).toBe('cancelled');
    });
});
