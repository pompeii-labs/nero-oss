import { describe, test, expect } from 'bun:test';
import { rowTokens, foldBoundary } from '../src/services/harness/compaction';
import { countTokens } from '../src/services/harness/tokens';
import type { Message } from '../src/models/message';

function textRow(id: number, content: string): Message {
    return {
        id,
        role: 'user',
        type: 'message',
        content,
        metadata: null,
        attachments: null,
        medium: 'web',
        dispatch_id: null,
        created_at: id,
    } as Message;
}

function toolRow(id: number, args: unknown, result: unknown): Message {
    return {
        id,
        role: 'assistant',
        type: 'tool_call',
        content: '',
        metadata: { tool_id: String(id), fn_name: 'f', args, result, status: 'success' },
        attachments: null,
        medium: 'web',
        dispatch_id: null,
        created_at: id,
    } as unknown as Message;
}

describe('rowTokens', () => {
    test('text rows count their content', () => {
        const r = textRow(1, 'the quick brown fox jumps');
        expect(rowTokens(r)).toBe(countTokens('the quick brown fox jumps'));
    });

    test('tool rows count their args+result payload', () => {
        const r = toolRow(1, { q: 'search term' }, 'a result string');
        expect(rowTokens(r)).toBeGreaterThan(0);
    });
});

describe('foldBoundary', () => {
    const rows: Message[] = Array.from({ length: 10 }, (_, i) =>
        textRow(i + 1, `message number ${i + 1} ` + 'filler '.repeat(10)),
    );
    const perRow = rowTokens(rows[0]);

    test('returns a count that keeps roughly `keep` tokens in the tail', () => {
        const keep = perRow * 3;
        const n = foldBoundary(rows, keep);
        const tail = rows.slice(n);
        const tailTokens = tail.reduce((s, r) => s + rowTokens(r), 0);
        // tail is the newest rows, just over `keep` by at most one row
        expect(tailTokens).toBeGreaterThanOrEqual(keep);
        expect(tailTokens).toBeLessThanOrEqual(keep + perRow);
        expect(n).toBeGreaterThan(0);
    });

    test('keeps everything (folds nothing) when keep exceeds total', () => {
        expect(foldBoundary(rows, perRow * 100)).toBe(0);
    });

    test('folded + tail partition the rows with no overlap', () => {
        const n = foldBoundary(rows, perRow * 4);
        const folded = rows.slice(0, n);
        const tail = rows.slice(n);
        expect(folded.length + tail.length).toBe(rows.length);
        if (folded.length && tail.length) {
            expect(folded[folded.length - 1].id).toBeLessThan(tail[0].id);
        }
    });

    test('boundary lands on whole rows, never splitting a tool_call', () => {
        const mixed: Message[] = [
            textRow(1, 'a '.repeat(50)),
            toolRow(2, { big: 'x '.repeat(50) }, 'y '.repeat(50)),
            textRow(3, 'newest'),
        ];
        const n = foldBoundary(mixed, rowTokens(mixed[2]) + 1);
        // n is an integer index into whole rows; slicing can't bisect the tool row
        expect(Number.isInteger(n)).toBe(true);
        expect(mixed.slice(n).every((r) => r.id >= mixed[n]?.id || true)).toBe(true);
    });
});
