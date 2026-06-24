import { describe, test, expect } from 'bun:test';
import { countTokens } from '../src/harness/tokens';

describe('countTokens', () => {
    test('empty string is zero', () => {
        expect(countTokens('')).toBe(0);
    });

    test('counts a known short string', () => {
        const n = countTokens('hello world');
        expect(n).toBeGreaterThan(0);
        expect(n).toBeLessThan(10);
    });

    test('scales with length', () => {
        const short = countTokens('one two three');
        const long = countTokens('one two three '.repeat(100));
        expect(long).toBeGreaterThan(short * 50);
    });

    test('is deterministic', () => {
        expect(countTokens('the quick brown fox')).toBe(countTokens('the quick brown fox'));
    });
});
