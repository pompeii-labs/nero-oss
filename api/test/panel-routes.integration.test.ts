import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { createServer } from '../src/server';
import { getLux } from '@nero/shared/lux';
import { Panel, type PanelFn } from '../src/models/panel';

const HAS_LUX = Boolean(process.env.LUX_SECRET_KEY && process.env.LUX_URL);
const d = HAS_LUX ? describe : describe.skip;

let server: ReturnType<typeof createServer>;
const base = () => `http://localhost:${server.port}`;
const created: string[] = [];

beforeAll(() => {
    if (!HAS_LUX) return;
    server = createServer({ port: 0 });
});
afterAll(async () => {
    if (!HAS_LUX) return;
    for (const id of created) await getLux().table('panels').delete().eq('id', id);
    await getLux().table('secrets').delete().eq('key', 'ROUTE_TEST_SECRET');
    server.stop(true);
});

async function panelWith(fn: PanelFn) {
    const p = await Panel.open({
        device_id: `rt-${Date.now()}`,
        title: 'RT',
        components: [{ type: 'metric', label: 'N', value: { bind: 'n' } }],
        functions: { go: fn },
    });
    created.push(p.id);
    return p;
}

d('panel + secret routes (Lux)', () => {
    test('POST /call runs the function and patches state', async () => {
        const p = await panelWith({ kind: 'shell', cmd: `echo '{"n":7}'` });
        const res = await fetch(`${base()}/v1/panels/${p.id}/call`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ fn: 'go' }),
        });
        expect(res.status).toBe(200);
        expect((await Panel.get(p.id))?.state.n).toBe(7);
    });

    test('POST /call with a failing function writes an error, not a 500', async () => {
        const p = await panelWith({ kind: 'js', code: 'throw new Error("kaboom");' });
        const res = await fetch(`${base()}/v1/panels/${p.id}/call`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ fn: 'go' }),
        });
        expect(res.status).toBe(200);
        expect((await Panel.get(p.id))?.state.error).toContain('kaboom');
    });

    test('POST /maximize toggles the flag', async () => {
        const p = await panelWith({ kind: 'shell', cmd: 'echo 1' });
        await fetch(`${base()}/v1/panels/${p.id}/maximize`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ on: true }),
        });
        expect((await Panel.get(p.id))?.maximized).toBe(true);
    });

    test('POST /geometry persists position', async () => {
        const p = await panelWith({ kind: 'shell', cmd: 'echo 1' });
        await fetch(`${base()}/v1/panels/${p.id}/geometry`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ x: 12, y: 34 }),
        });
        const got = await Panel.get(p.id);
        expect([got?.x, got?.y]).toEqual([12, 34]);
    });

    test('secret route sets, lists names only, deletes', async () => {
        await fetch(`${base()}/v1/secrets`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ key: 'ROUTE_TEST_SECRET', value: 'topsecret' }),
        });
        const listed = await (await fetch(`${base()}/v1/secrets`)).json();
        const row = listed.secrets.find((s: { key: string }) => s.key === 'ROUTE_TEST_SECRET');
        expect(row).toBeTruthy();
        expect(JSON.stringify(listed)).not.toContain('topsecret');

        await fetch(`${base()}/v1/secrets/ROUTE_TEST_SECRET`, { method: 'DELETE' });
        const after = await (await fetch(`${base()}/v1/secrets`)).json();
        expect(after.secrets.some((s: { key: string }) => s.key === 'ROUTE_TEST_SECRET')).toBe(
            false,
        );
    });
});
