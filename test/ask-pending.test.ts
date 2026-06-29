import { describe, test, expect } from 'bun:test';
import { waitForAnswer, deliverAnswer } from '../src/ask/pending';

describe('ask pending registry', () => {
    test('deliverAnswer resolves the waiter with the choices', async () => {
        const p = waitForAnswer('q1', 1000);
        expect(deliverAnswer('q1', { kind: 'answered', answers: [['Option A']] })).toBe(true);
        expect(await p).toEqual({ kind: 'answered', answers: [['Option A']] });
    });

    test('delivering to an unknown id returns false (stale click)', () => {
        expect(deliverAnswer('nope', { kind: 'cancelled' })).toBe(false);
    });

    test('a dismissal resolves as cancelled', async () => {
        const p = waitForAnswer('q2', 1000);
        deliverAnswer('q2', { kind: 'cancelled' });
        expect(await p).toEqual({ kind: 'cancelled' });
    });

    test('times out if never answered', async () => {
        const p = waitForAnswer('q3', 40);
        expect(await p).toEqual({ kind: 'timeout' });
    });

    test('a second deliver after resolution is a no-op', async () => {
        const p = waitForAnswer('q4', 1000);
        expect(deliverAnswer('q4', { kind: 'answered', answers: [['X']] })).toBe(true);
        await p;
        expect(deliverAnswer('q4', { kind: 'answered', answers: [['Y']] })).toBe(false);
    });
});
