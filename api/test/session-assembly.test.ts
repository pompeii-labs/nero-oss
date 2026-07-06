import { describe, test, expect } from 'bun:test';
import {
    rowsToSessionMessages,
    coalesce,
    trimToBudget,
    messageToText,
} from '../src/services/harness/session';
import type { Message } from '../src/models/message';
import type { MagmaMessageType } from '@pompeii-labs/magma/types';

function row(partial: Partial<Message> & { id: number }): Message {
    return {
        id: partial.id,
        role: partial.role ?? 'user',
        type: partial.type ?? 'message',
        content: partial.content ?? '',
        metadata: partial.metadata ?? null,
        attachments: partial.attachments ?? null,
        medium: 'web',
        dispatch_id: null,
        created_at: partial.id,
    } as Message;
}

describe('rowsToSessionMessages', () => {
    test('human message -> plain user turn (no name prefix)', () => {
        const out = rowsToSessionMessages([row({ id: 1, role: 'user', content: 'hello' })]);
        expect(out).toEqual([{ role: 'user', content: 'hello' }] as MagmaMessageType[]);
    });

    test('agent_text -> assistant turn', () => {
        const out = rowsToSessionMessages([
            row({ id: 1, role: 'assistant', type: 'agent_text', content: 'hi' }),
        ]);
        expect(out).toEqual([{ role: 'assistant', content: 'hi' }] as MagmaMessageType[]);
    });

    test('tool_call -> paired assistant tool_call + user tool_result with matching id', () => {
        const out = rowsToSessionMessages([
            row({
                id: 7,
                role: 'assistant',
                type: 'tool_call',
                metadata: {
                    tool_id: 'abc',
                    fn_name: 'search',
                    args: { q: 'x' },
                    result: 'found',
                    status: 'success',
                },
            }),
        ]);
        expect(out).toHaveLength(2);
        const callBlock = out[0].blocks![0];
        const resultBlock = out[1].blocks![0];
        expect(callBlock.type).toBe('tool_call');
        expect(resultBlock.type).toBe('tool_result');
        // @ts-expect-error narrow in test
        expect(callBlock.tool_call.id).toBe('abc');
        // @ts-expect-error narrow in test
        expect(resultBlock.tool_result.id).toBe('abc');
        // @ts-expect-error narrow in test
        expect(resultBlock.tool_result.result).toBe('found');
    });

    test('tool_call without tool_id falls back to the row id', () => {
        const out = rowsToSessionMessages([
            row({
                id: 42,
                role: 'assistant',
                type: 'tool_call',
                metadata: { fn_name: 'x', args: {} },
            }),
        ]);
        // @ts-expect-error narrow in test
        expect(out[0].blocks[0].tool_call.id).toBe('42');
    });

    test('image attachments become image blocks via the resolver', () => {
        const out = rowsToSessionMessages(
            [
                row({
                    id: 1,
                    content: 'look',
                    attachments: [{ id: 'f1', mime: 'image/png', name: 'a.png' }],
                }),
            ],
            { imageBlock: (ref) => ({ type: 'image/url', data: `/v1/files/${ref.id}` }) },
        );
        expect(out).toHaveLength(1);
        const blocks = out[0].blocks!;
        expect(blocks[0]).toEqual({ type: 'text', text: 'look' });
        expect(blocks[1].type).toBe('image');
        // @ts-expect-error narrow in test
        expect(blocks[1].image.data).toBe('/v1/files/f1');
    });

    test('empty message with no content and no images is skipped', () => {
        expect(rowsToSessionMessages([row({ id: 1, content: '' })])).toEqual([]);
    });
});

describe('coalesce', () => {
    test('merges consecutive same-role plain turns', () => {
        const out = coalesce([
            { role: 'user', content: 'a' },
            { role: 'user', content: 'b' },
            { role: 'assistant', content: 'c' },
        ] as MagmaMessageType[]);
        expect(out).toEqual([
            { role: 'user', content: 'a\nb' },
            { role: 'assistant', content: 'c' },
        ] as MagmaMessageType[]);
    });

    test('never coalesces across tool-bearing turns', () => {
        const toolTurn = {
            role: 'assistant',
            blocks: [{ type: 'tool_call', tool_call: { id: '1', fn_name: 'f', fn_args: {} } }],
        } as MagmaMessageType;
        const out = coalesce([
            { role: 'assistant', content: 'before' } as MagmaMessageType,
            toolTurn,
            { role: 'assistant', content: 'after' } as MagmaMessageType,
        ]);
        expect(out).toHaveLength(3);
        expect(out[1]).toBe(toolTurn);
    });
});

describe('trimToBudget', () => {
    test('keeps the leading summary and the newest tail, drops oldest', () => {
        const msgs: MagmaMessageType[] = [
            { role: 'assistant', content: 'SUMMARY ' + 'x '.repeat(20) },
            { role: 'user', content: 'old ' + 'a '.repeat(200) },
            { role: 'assistant', content: 'mid ' + 'b '.repeat(200) },
            { role: 'user', content: 'newest' },
        ];
        const out = trimToBudget(msgs, 80, true);
        expect(out[0].content).toContain('SUMMARY');
        expect(out[out.length - 1].content).toBe('newest');
        expect(out.length).toBeLessThan(msgs.length);
    });

    test('hard-truncates a single oversized newest message and terminates', () => {
        const msgs: MagmaMessageType[] = [{ role: 'user', content: 'word '.repeat(5000) }];
        const out = trimToBudget(msgs, 50, false);
        expect(out).toHaveLength(1);
        expect(messageToText(out[0]).length).toBeLessThan(messageToText(msgs[0]).length);
    });

    test('empty input returns empty', () => {
        expect(trimToBudget([], 100, false)).toEqual([]);
    });
});
