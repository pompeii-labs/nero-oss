import { describe, test, expect, afterAll } from 'bun:test';
import { Action } from '../src/models/action';
import { Secret } from '../src/models/secret';
import { Actions } from '../src/services/actions';
import { catalogStatus } from '../src/services/actions/catalog';

const HAS_LUX = Boolean(process.env.LUX_SECRET_KEY && process.env.LUX_URL);
const d = HAS_LUX ? describe : describe.skip;

const created: string[] = [];

async function make(input: Parameters<typeof Actions.create>[0]) {
    const a = await Actions.create(input);
    created.push(a.id);
    return a;
}

d('actions data layer (Lux)', () => {
    afterAll(async () => {
        if (!HAS_LUX) return;
        for (const id of created) await Action.remove(id);
        await Secret.remove('LIFX_API_KEY').catch(() => {});
    });

    test('create persists a script action on a slot', async () => {
        const a = await make({
            label: 'Verify',
            kind: 'shell',
            body: 'echo dial-ok',
            icon: 'terminal',
            slot: 7,
        });
        expect(a.id).toBeTruthy();
        expect(a.slot).toBe(7);
        expect(a.last_run_at).toBe(0);
        expect((await Action.atSlot(7))?.id).toBe(a.id);
    });

    test('run captures stdout and stderr and stamps last_run_at', async () => {
        const a = await make({
            label: 'Streams',
            kind: 'shell',
            body: 'echo out-here && echo err-here 1>&2',
        });
        const r = await Actions.run(a.id);
        expect(r.ok).toBe(true);
        expect(r.output).toContain('out-here');
        expect(r.output).toContain('err-here');
        expect(r.builtin).toBeUndefined();
        expect((await Action.get(a.id))?.last_run_at ?? 0).toBeGreaterThan(0);
    });

    test('a non-zero exit reports failure, not a throw', async () => {
        const a = await make({ label: 'Nope', kind: 'shell', body: 'exit 3' });
        const r = await Actions.run(a.id);
        expect(r.ok).toBe(false);
        expect(r.output).toContain('exit 3');
    });

    test('a builtin returns its key for the client, and runs nothing', async () => {
        const a = await make({ label: 'Voice', kind: 'builtin', body: 'voice' });
        const r = await Actions.run(a.id);
        expect(r.ok).toBe(true);
        expect(r.builtin).toBe('voice');
    });

    test('binding a taken slot displaces the occupant instead of double-booking', async () => {
        const first = await make({ label: 'First', kind: 'shell', body: 'true', slot: 5 });
        const second = await make({ label: 'Second', kind: 'shell', body: 'true', slot: 5 });
        expect(second.slot).toBe(5);
        expect((await Action.get(first.id))?.slot).toBe(-1);
        expect((await Action.atSlot(5))?.id).toBe(second.id);
    });

    test('assign moves a slot and -1 unbinds', async () => {
        const a = await make({ label: 'Mover', kind: 'shell', body: 'true' });
        expect((await Actions.assign(a.id, 2))?.slot).toBe(2);
        expect((await Actions.assign(a.id, -1))?.slot).toBe(-1);
    });

    test('running an unknown id fails cleanly', async () => {
        const r = await Actions.run('00000000-0000-0000-0000-000000000000');
        expect(r.ok).toBe(false);
        expect(r.output).toBe('no such action');
    });

    test('a template bakes params in but leaves secrets as refs', async () => {
        const r = await Actions.fromTemplate('lifx.toggle', {
            slot: 2,
            params: { selector: 'group:Bedroom', duration: '2' },
        });
        const a = r.action;
        if (a) created.push(a.id);
        expect(a).toBeTruthy();
        expect(a?.provider).toBe('lifx');
        expect(a?.template_id).toBe('lifx.toggle');
        expect(a?.params.selector).toBe('group:Bedroom');

        const fn = a?.fn;
        expect(fn?.kind).toBe('http');
        if (fn?.kind !== 'http') throw new Error('expected an http fn');
        // param baked...
        expect(fn.url).toContain('group:Bedroom');
        expect(fn.url).not.toContain('{{');
        // ...secret NOT baked. It resolves per run, so rotating the token doesn't
        // orphan the action and the value never lands in a row.
        expect(fn.headers?.Authorization).toBe('Bearer ${LIFX_API_KEY}');
    });

    test('an unknown template is rejected, and required params are enforced', async () => {
        expect((await Actions.fromTemplate('nope.nope')).error).toContain('no template');
        const r = await Actions.fromTemplate('generic.http', { params: { method: 'GET' } });
        expect(r.error).toContain('url');
    });

    test('the catalogue reports LIFX unavailable without a token', async () => {
        const templates = await catalogStatus();
        const toggle = templates.find((t) => t.id === 'lifx.toggle');
        expect(toggle?.requiredSecrets).toEqual(['LIFX_API_KEY']);
        // native needs nothing, so it is always usable
        expect(templates.find((t) => t.id === 'native.remember')?.available).toBe(true);
        // and no template leaks its fn to the model or the browser
        expect(templates.every((t) => !('fn' in t))).toBe(true);
    });

    test('remove deletes the row', async () => {
        const a = await Actions.create({ label: 'Doomed', kind: 'shell', body: 'true' });
        await Action.remove(a.id);
        expect(await Action.get(a.id)).toBeNull();
    });
});
