import { describe, test, expect } from 'bun:test';
import { interpolate } from '../src/util/interpolate';

describe('secret interpolation', () => {
    const secrets = { API_KEY: 'abc123', HOST: 'example.com' };

    test('resolves ${NAME} braced form', () => {
        expect(interpolate('Bearer ${API_KEY}', secrets)).toBe('Bearer abc123');
    });

    test('resolves bare $NAME form', () => {
        expect(interpolate('https://$HOST/v1', secrets)).toBe('https://example.com/v1');
    });

    test('resolves multiple references in one string', () => {
        expect(interpolate('https://${HOST}/?k=${API_KEY}', secrets)).toBe(
            'https://example.com/?k=abc123',
        );
    });

    test('leaves non-references untouched', () => {
        expect(interpolate('plain text, $100 price', secrets)).toBe('plain text, $100 price');
    });

    test('throws on a missing secret', () => {
        expect(() => interpolate('${NOPE}', secrets)).toThrow('Missing secret "NOPE"');
    });

    test('does not re-scan replacement output (no recursion)', () => {
        expect(interpolate('${API_KEY}', { API_KEY: '${HOST}', HOST: 'x' })).toBe('${HOST}');
    });
});
