import { describe, test, expect, afterAll } from 'bun:test';
import { Secret } from '../src/models/secret';

const HAS_LUX = Boolean(process.env.LUX_SECRET_KEY && process.env.LUX_URL);
const d = HAS_LUX ? describe : describe.skip;

const K1 = `TEST_KEY_${Date.now()}`;
const K2 = `TEST_STAGED_${Date.now()}`;

d('secrets data layer (Lux)', () => {
    afterAll(async () => {
        if (!HAS_LUX) return;
        await Secret.remove(K1);
        await Secret.remove(K2);
    });

    test('set then loadMap returns the value', async () => {
        await Secret.set(K1, 'val-1');
        const map = await Secret.loadMap();
        expect(map[K1]).toBe('val-1');
    });

    test('set is idempotent upsert (replaces value)', async () => {
        await Secret.set(K1, 'val-2');
        const map = await Secret.loadMap();
        expect(map[K1]).toBe('val-2');
    });

    test('stage creates a placeholder excluded from loadMap', async () => {
        const r = await Secret.stage(K2, 'a staged key');
        expect(r).toBe('created');
        const map = await Secret.loadMap();
        expect(K2 in map).toBe(false);
    });

    test('stage on an existing key is a no-op', async () => {
        expect(await Secret.stage(K1, 'x')).toBe('exists');
    });

    test('listMeta exposes names + placeholder flag but never values', async () => {
        const meta = await Secret.listMeta();
        const m1 = meta.find((m) => m.key === K1);
        const m2 = meta.find((m) => m.key === K2);
        expect(m1).toBeTruthy();
        expect(m2?.isPlaceholder).toBe(true);
        expect(m2?.description).toBe('a staged key');
        // no value field on the metadata shape
        expect(Object.keys(m1 ?? {})).not.toContain('value');
    });

    test('setting a staged key fills it and clears the placeholder', async () => {
        await Secret.set(K2, 'now-real');
        const map = await Secret.loadMap();
        expect(map[K2]).toBe('now-real');
        const meta = (await Secret.listMeta()).find((m) => m.key === K2);
        expect(meta?.isPlaceholder).toBe(false);
    });

    test('remove deletes the secret', async () => {
        await Secret.remove(K1);
        const map = await Secret.loadMap();
        expect(K1 in map).toBe(false);
    });
});
