import { describe, test, expect } from 'vitest';
import { desiredPolls, reconcilePolls } from './poll';

describe('desiredPolls', () => {
    test('selects functions with everyMs >= 1000', () => {
        const want = desiredPolls([
            { id: 'p1', functions: { a: { everyMs: 2000 }, b: { everyMs: 500 }, c: {} } },
        ]);
        expect([...want.keys()]).toEqual(['p1:a']);
        expect(want.get('p1:a')).toEqual({ pid: 'p1', fn: 'a', everyMs: 2000 });
    });

    test('handles panels with no functions', () => {
        expect(desiredPolls([{ id: 'p1' }, { id: 'p2', functions: null }]).size).toBe(0);
    });
});

describe('reconcilePolls', () => {
    test('starts a new poll', () => {
        const desired = desiredPolls([{ id: 'p1', functions: { r: { everyMs: 2000 } } }]);
        const { start, stop } = reconcilePolls(desired, new Map());
        expect(stop).toEqual([]);
        expect(start).toEqual([{ pid: 'p1', fn: 'r', everyMs: 2000 }]);
    });

    test('leaves an unchanged poll running', () => {
        const desired = desiredPolls([{ id: 'p1', functions: { r: { everyMs: 2000 } } }]);
        const { start, stop } = reconcilePolls(desired, new Map([['p1:r', 2000]]));
        expect(start).toEqual([]);
        expect(stop).toEqual([]);
    });

    test('stops a poll that is no longer desired', () => {
        const { start, stop } = reconcilePolls(new Map(), new Map([['p1:r', 2000]]));
        expect(stop).toEqual(['p1:r']);
        expect(start).toEqual([]);
    });

    test('restarts a poll whose interval changed', () => {
        const desired = desiredPolls([{ id: 'p1', functions: { r: { everyMs: 5000 } } }]);
        const { start, stop } = reconcilePolls(desired, new Map([['p1:r', 2000]]));
        expect(stop).toEqual(['p1:r']);
        expect(start).toEqual([{ pid: 'p1', fn: 'r', everyMs: 5000 }]);
    });
});
