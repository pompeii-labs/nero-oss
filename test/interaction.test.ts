import { describe, test, expect } from 'bun:test';
import { formatInteraction } from '../src/panels/interaction';
import type { Panel } from '../src/models/panel';

const panel = { title: 'Dashboard' } as Panel;

describe('formatInteraction', () => {
    test('labels the panel and the pressed control', () => {
        const t = formatInteraction(panel, { control: 'Tell a joke' });
        expect(t).toBe('[interaction] On your panel "Dashboard", the user pressed "Tell a joke".');
    });

    test('includes a value when present', () => {
        const t = formatInteraction(panel, { control: 'Slider', value: 42 });
        expect(t).toContain('Value: 42.');
    });

    test('includes the authored intent when present', () => {
        const t = formatInteraction(panel, { control: 'Buy', intent: 'place an order' });
        expect(t).toContain('(You set this up meaning: place an order.)');
    });

    test('falls back to "a control" when none given', () => {
        expect(formatInteraction(panel, {})).toContain('pressed "a control"');
    });
});
