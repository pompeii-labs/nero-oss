import { describe, test, expect, afterAll } from 'bun:test';
import * as secrets from '../src/data/secrets';

const HAS_LUX = Boolean(process.env.LUX_SECRET_KEY && process.env.LUX_URL);
const d = HAS_LUX ? describe : describe.skip;

const K1 = `TEST_KEY_${Date.now()}`;
const K2 = `TEST_STAGED_${Date.now()}`;

d('secrets data layer (Lux)', () => {
    afterAll(async () => {
        if (!HAS_LUX) return;
        await secrets.remove(K1);
        await secrets.remove(K2);
    });

    test('set then loadMap returns the value', async () => {
        await secrets.set(K1, 'val-1');
        const map = await secrets.loadMap();
        expect(map[K1]).toBe('val-1');
    });

    test('set is idempotent upsert (replaces value)', async () => {
        await secrets.set(K1, 'val-2');
        const map = await secrets.loadMap();
        expect(map[K1]).toBe('val-2');
    });

    test('stage creates a placeholder excluded from loadMap', async () => {
        const r = await secrets.stage(K2, 'a staged key');
        expect(r).toBe('created');
        const map = await secrets.loadMap();
        expect(K2 in map).toBe(false);
    });

    test('stage on an existing key is a no-op', async () => {
        expect(await secrets.stage(K1, 'x')).toBe('exists');
    });

    test('listMeta exposes names + placeholder flag but never values', async () => {
        const meta = await secrets.listMeta();
        const m1 = meta.find((m) => m.key === K1);
        const m2 = meta.find((m) => m.key === K2);
        expect(m1).toBeTruthy();
        expect(m2?.isPlaceholder).toBe(true);
        expect(m2?.description).toBe('a staged key');
        // no value field on the metadata shape
        expect(Object.keys(m1 ?? {})).not.toContain('value');
    });

    test('setting a staged key fills it and clears the placeholder', async () => {
        await secrets.set(K2, 'now-real');
        const map = await secrets.loadMap();
        expect(map[K2]).toBe('now-real');
        const meta = (await secrets.listMeta()).find((m) => m.key === K2);
        expect(meta?.isPlaceholder).toBe(false);
    });

    test('remove deletes the secret', async () => {
        await secrets.remove(K1);
        const map = await secrets.loadMap();
        expect(K1 in map).toBe(false);
    });
});
