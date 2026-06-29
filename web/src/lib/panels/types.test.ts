import { describe, test, expect } from 'vitest';
import { resolve } from './types';

describe('resolve (binding)', () => {
    test('returns a literal value unchanged', () => {
        expect(resolve('hi', {})).toBe('hi');
        expect(resolve(5, {})).toBe(5);
    });

    test('resolves {bind} against state', () => {
        expect(resolve({ bind: 'x' }, { x: 42 })).toBe(42);
        expect(resolve({ bind: 'label' }, { label: 'CPU' })).toBe('CPU');
    });

    test('a missing bind key resolves to undefined', () => {
        expect(resolve({ bind: 'nope' }, {})).toBeUndefined();
    });

    test('passes arrays through literally (not treated as bindings)', () => {
        const arr = [1, 2, 3];
        expect(resolve(arr as never, {})).toBe(arr);
    });
});
