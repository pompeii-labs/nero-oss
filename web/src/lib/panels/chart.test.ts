import { describe, test, expect } from 'vitest';
import { toNum, pushSample, chartGeometry } from './chart';

describe('toNum', () => {
    test('passes finite numbers through', () => {
        expect(toNum(42)).toBe(42);
        expect(toNum(-1.5)).toBe(-1.5);
    });
    test('parses formatted currency / percent strings', () => {
        expect(toNum('$60,894')).toBe(60894);
        expect(toNum('42%')).toBe(42);
        expect(toNum('$1,615.62')).toBeCloseTo(1615.62);
    });
    test('rejects arrays, objects, non-numeric strings, and non-finite numbers', () => {
        expect(toNum([])).toBeUndefined();
        expect(toNum([5])).toBeUndefined();
        expect(toNum({})).toBeUndefined();
        expect(toNum('n/a')).toBeUndefined();
        expect(toNum(NaN)).toBeUndefined();
        expect(toNum(Infinity)).toBeUndefined();
    });
});

describe('pushSample', () => {
    test('appends a value', () => {
        expect(pushSample([1, 2], 3, 10)).toEqual([1, 2, 3]);
    });
    test('caps at the window (keeps most recent)', () => {
        expect(pushSample([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
    });
});

describe('chartGeometry', () => {
    test('returns empty shapes for fewer than 2 points', () => {
        expect(chartGeometry([])).toEqual({ line: '', area: '', bars: [] });
        expect(chartGeometry([5])).toEqual({ line: '', area: '', bars: [] });
    });
    test('builds a polyline with one point per sample', () => {
        const g = chartGeometry([0, 5, 10]);
        expect(g.line.split(' ')).toHaveLength(3);
        expect(g.bars).toHaveLength(3);
    });
    test('first x is 0 and last x is 100 (spans the viewBox)', () => {
        const g = chartGeometry([1, 2, 3, 4]);
        const xs = g.line.split(' ').map((p) => parseFloat(p.split(',')[0]));
        expect(xs[0]).toBe(0);
        expect(xs[xs.length - 1]).toBe(100);
    });
    test('a flat series does not divide by zero (renders a flat line)', () => {
        const g = chartGeometry([7, 7, 7]);
        const ys = g.line.split(' ').map((p) => parseFloat(p.split(',')[1]));
        expect(ys.every((y) => y === ys[0])).toBe(true);
        expect(Number.isFinite(ys[0])).toBe(true);
    });
});
