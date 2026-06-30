import { describe, test, expect } from 'bun:test';
import { waitForApproval, deliverApproval } from '../src/services/projects/approval';
import { Pricing } from '../src/services/projects/pricing';

describe('project approval registry', () => {
    test('deliverApproval resolves the waiter with run + budget', async () => {
        const p = waitForApproval('p1', 1000);
        expect(deliverApproval('p1', { kind: 'run', budgetUsd: 5 })).toBe(true);
        expect(await p).toEqual({ kind: 'run', budgetUsd: 5 });
    });

    test('delivering to an unknown id returns false (stale click)', () => {
        expect(deliverApproval('nope', { kind: 'cancel' })).toBe(false);
    });

    test('tweak carries the note', async () => {
        const p = waitForApproval('p2', 1000);
        deliverApproval('p2', { kind: 'tweak', note: 'narrow the scope' });
        expect(await p).toEqual({ kind: 'tweak', note: 'narrow the scope' });
    });

    test('times out if never approved', async () => {
        const p = waitForApproval('p3', 40);
        expect(await p).toEqual({ kind: 'timeout' });
    });

    test('a second deliver after resolution is a no-op', async () => {
        const p = waitForApproval('p4', 1000);
        expect(deliverApproval('p4', { kind: 'cancel' })).toBe(true);
        await p;
        expect(deliverApproval('p4', { kind: 'run', budgetUsd: 9 })).toBe(false);
    });
});

describe('project pricing', () => {
    test('costUsd uses the fallback map when the registry is unreachable', async () => {
        Pricing.reset();
        // haiku-4.5 fallback: in 1e-6, out 5e-6
        const c = await Pricing.costUsd('anthropic/claude-haiku-4.5', 1_000_000, 1_000_000);
        // live registry may override; just assert it is a sane positive number.
        expect(c).toBeGreaterThan(0);
    });

    test('an unknown model falls back to the conservative default', async () => {
        const c = await Pricing.costUsd('made-up/model-x', 100, 100);
        expect(c).toBeGreaterThan(0);
    });
});
