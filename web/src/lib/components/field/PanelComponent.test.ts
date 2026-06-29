import { describe, test, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import PanelComponent from './PanelComponent.svelte';
import type { Comp, PanelAction } from '$lib/panels/types';

function mount(node: Comp, state: Record<string, unknown> = {}) {
    const onAction = vi.fn<(a: PanelAction, control: string) => void>();
    const { container } = render(PanelComponent, { props: { node, state, onAction } });
    return { container, onAction };
}

describe('PanelComponent — rendering every type', () => {
    test('text renders its content', () => {
        const { container } = mount({ type: 'text', text: 'Hello Nero' });
        expect(container.textContent).toContain('Hello Nero');
    });

    test('text resolves a {bind} from state', () => {
        const { container } = mount({ type: 'text', text: { bind: 'msg' } }, { msg: 'Bound text' });
        expect(container.textContent).toContain('Bound text');
    });

    test('metric shows label and bound value', () => {
        const { container } = mount(
            { type: 'metric', label: 'CPU', value: { bind: 'cpu' } },
            { cpu: '42%' },
        );
        expect(container.textContent).toContain('CPU');
        expect(container.textContent).toContain('42%');
    });

    test('progress fills to the right width', () => {
        const { container } = mount({ type: 'progress', value: 50, max: 100 });
        const fill = container.querySelector('.pc-pfill') as HTMLElement;
        expect(fill.style.width).toBe('50%');
    });

    test('list renders each item', () => {
        const { container } = mount({ type: 'list', items: ['one', 'two', 'three'] });
        expect(container.querySelectorAll('li')).toHaveLength(3);
    });

    test('badge renders its text', () => {
        const { container } = mount({ type: 'badge', text: 'LIVE', tone: 'good' });
        expect(container.textContent).toContain('LIVE');
    });

    test('divider renders an hr', () => {
        const { container } = mount({ type: 'divider' });
        expect(container.querySelector('hr')).toBeTruthy();
    });

    test('row and stack render their children', () => {
        const { container } = mount({
            type: 'row',
            children: [
                { type: 'text', text: 'A' },
                { type: 'text', text: 'B' },
            ],
        });
        expect(container.textContent).toContain('A');
        expect(container.textContent).toContain('B');
    });

    test('chart (data mode) renders an svg series', () => {
        const { container } = mount({ type: 'chart', data: [1, 4, 2, 8] });
        expect(container.querySelector('svg')).toBeTruthy();
        expect(container.querySelector('polyline')).toBeTruthy();
    });

    test('youtube renders the player container', () => {
        const { container } = mount({ type: 'youtube', videoId: 'dQw4w9WgXcQ' });
        expect(container.querySelector('.yt')).toBeTruthy();
    });
});

describe('PanelComponent — actions', () => {
    test('an interact button fires onAction with the interact action + label', async () => {
        const { container, onAction } = mount({
            type: 'button',
            label: 'Tell a joke',
            action: { type: 'interact', intent: 'joke' },
        });
        await fireEvent.click(container.querySelector('button')!);
        expect(onAction).toHaveBeenCalledWith({ type: 'interact', intent: 'joke' }, 'Tell a joke');
    });

    test('a call button fires onAction with the call action', async () => {
        const { container, onAction } = mount({
            type: 'button',
            label: 'Refresh',
            action: { type: 'call', fn: 'refresh' },
        });
        await fireEvent.click(container.querySelector('button')!);
        expect(onAction).toHaveBeenCalledWith({ type: 'call', fn: 'refresh' }, 'Refresh');
    });
});
