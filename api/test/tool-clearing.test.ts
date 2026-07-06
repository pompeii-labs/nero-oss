import { describe, test, expect } from 'bun:test';
import OpenAI from 'openai';
import { NeroAgent } from '../src/services/harness/agent';
import type { MagmaMessage } from '@pompeii-labs/magma/types';

const stubClient = new OpenAI({ apiKey: 'test-key', baseURL: 'http://localhost:1' });

function agentWith(window: number): NeroAgent {
    const a = new NeroAgent({ client: stubClient });
    a.contextWindow = window;
    return a;
}

function addToolPair(a: NeroAgent, id: string, resultText: string): void {
    const call = { id, fn_name: 'search', fn_args: { q: id } };
    a.addMessage({ role: 'assistant', blocks: [{ type: 'tool_call', tool_call: call }] });
    a.addMessage({
        role: 'user',
        blocks: [
            {
                type: 'tool_result',
                tool_result: { id, fn_name: 'search', result: resultText, error: false, call },
            },
        ],
    });
}

function toolResults(messages: MagmaMessage[]): string[] {
    const out: string[] = [];
    for (const m of messages) {
        for (const b of m.blocks ?? []) {
            if (b.type === 'tool_result') out.push(String(b.tool_result.result));
        }
    }
    return out;
}

const BIG = 'token '.repeat(80);

describe('NeroAgent.getMessages tool-output clearing', () => {
    test('clears older tool results past the keep budget, keeps the newest', () => {
        const a = agentWith(200); // keepBudget = 100 tokens
        for (let i = 1; i <= 6; i++) addToolPair(a, `t${i}`, `result ${i} ${BIG}`);

        const results = toolResults(a.getMessages());
        expect(results.some((r) => r === '[old tool result cleared]')).toBe(true);
        // newest is always kept verbatim
        expect(results[results.length - 1]).toContain('result 6');
    });

    test('preserves the tool_result id + pairing when clearing', () => {
        const a = agentWith(200);
        for (let i = 1; i <= 6; i++) addToolPair(a, `t${i}`, `result ${i} ${BIG}`);

        const msgs = a.getMessages();
        const callIds = new Set<string>();
        const resultIds = new Set<string>();
        for (const m of msgs) {
            for (const b of m.blocks ?? []) {
                if (b.type === 'tool_call') callIds.add(b.tool_call.id);
                if (b.type === 'tool_result') resultIds.add(b.tool_result.id);
            }
        }
        // every call still has its matching result, cleared or not
        expect([...callIds].every((id) => resultIds.has(id))).toBe(true);
        expect(resultIds.size).toBe(6);
    });

    test('does not mutate stored history (stable across calls)', () => {
        const a = agentWith(200);
        for (let i = 1; i <= 6; i++) addToolPair(a, `t${i}`, `result ${i} ${BIG}`);

        const first = toolResults(a.getMessages());
        const second = toolResults(a.getMessages());
        expect(second).toEqual(first);
        // the oldest result is still cleared on the second call (source intact)
        expect(first[0]).toBe('[old tool result cleared]');
    });

    test('under budget: returns everything verbatim', () => {
        const a = agentWith(1_000_000);
        for (let i = 1; i <= 6; i++) addToolPair(a, `t${i}`, `result ${i} ${BIG}`);

        const results = toolResults(a.getMessages());
        expect(results.some((r) => r === '[old tool result cleared]')).toBe(false);
        expect(results).toHaveLength(6);
    });
});

describe('NeroAgent.getSystemPrompts', () => {
    test('caches the stable block and puts memories/time in a fresh block', () => {
        const a = agentWith(128_000);
        a.currentMemories = 'MEMORY: the user likes terse replies';
        const [sys] = a.getSystemPrompts();
        expect(sys.role).toBe('system');
        const blocks = sys.blocks as { text: string; cache?: boolean }[];
        const stable = blocks[0];
        const volatile = blocks[1];
        // stable instructions are the cache breakpoint (default model is anthropic/);
        // memories/time are not cached
        expect(stable.cache).toBe(true);
        expect(stable.text).not.toContain('{{MEMORIES}}');
        expect(stable.text).not.toContain('the user likes terse replies');
        expect(volatile.cache).toBeFalsy();
        expect(volatile.text).toContain('the user likes terse replies');
        expect(volatile.text).toContain('Right now it is');
        expect(volatile.text).toContain(String(new Date().getFullYear()));
    });
});
