import { describe, test, expect, afterAll } from 'bun:test';
import { getLux } from '../src/lux/client';
import * as panels from '../src/data/panels';

const HAS_LUX = Boolean(process.env.LUX_SECRET_KEY && process.env.LUX_URL);
const d = HAS_LUX ? describe : describe.skip;

const DEVICE = `test-dev-${Date.now()}`;
const created: string[] = [];

async function make(extra: Partial<panels.CreateInput> = {}) {
    const p = await panels.create({
        deviceId: DEVICE,
        title: 'T',
        components: [{ type: 'text', text: 'hi' }],
        ...extra,
    });
    created.push(p.id);
    return p;
}

d('panels data layer (Lux)', () => {
    afterAll(async () => {
        if (!HAS_LUX) return;
        for (const id of created) await getLux().table('panels').delete().eq('id', id);
    });

    test('create applies defaults and persists components', async () => {
        const p = await make();
        expect(p.x).toBe(40);
        expect(p.w).toBe(380);
        expect(p.status).toBe('open');
        expect(p.maximized).toBe(false);
        expect(p.components).toEqual([{ type: 'text', text: 'hi' }]);
    });

    test('create accepts geometry, state, functions', async () => {
        const p = await make({
            x: 10,
            y: 20,
            w: 500,
            state: { cpu: 1 },
            functions: { r: { kind: 'shell', cmd: 'echo 1', everyMs: 2000 } },
        });
        const got = await panels.get(p.id);
        expect(got?.x).toBe(10);
        expect(got?.w).toBe(500);
        expect(got?.state).toEqual({ cpu: 1 });
        expect(got?.functions.r).toEqual({ kind: 'shell', cmd: 'echo 1', everyMs: 2000 });
    });

    test('update geometry persists', async () => {
        const p = await make();
        await panels.update(p.id, { x: 111, y: 222, w: 333, h: 444 });
        const got = await panels.get(p.id);
        expect([got?.x, got?.y, got?.w, got?.h]).toEqual([111, 222, 333, 444]);
    });

    test('maximize flag round-trips', async () => {
        const p = await make();
        await panels.update(p.id, { maximized: true });
        expect((await panels.get(p.id))?.maximized).toBe(true);
        await panels.update(p.id, { maximized: false });
        expect((await panels.get(p.id))?.maximized).toBe(false);
    });

    test('listOpen returns open panels, close removes them', async () => {
        const p = await make();
        let open = await panels.listOpen(DEVICE);
        expect(open.some((x) => x.id === p.id)).toBe(true);
        await panels.close(p.id);
        open = await panels.listOpen(DEVICE);
        expect(open.some((x) => x.id === p.id)).toBe(false);
    });
});
