import { getLux, unwrap } from '../lux/client';
import { loadConfig } from '../config';
import type { Settings } from '../lux/types';

/**
 * Runtime-mutable, single-user config in Lux. Source of truth for things that
 * change without a restart (the model, etc.). The env var is the bootstrap
 * default; a value here overrides it. Resolution: Lux setting -> env -> default.
 */

export const MODEL_KEY = 'model';

/** Read a setting, or null if unset. */
export async function get(key: string): Promise<string | null> {
    const rows = unwrap(
        await getLux().table('settings').select().eq('key', key).limit(1),
    ) as Settings[];
    return rows.length ? (rows[0].value ?? null) : null;
}

/** Upsert a setting. */
export async function set(key: string, value: string): Promise<void> {
    const rows = unwrap(
        await getLux().table('settings').select().eq('key', key).limit(1),
    ) as Settings[];
    const body = { key, value, updated_at: Date.now() };
    if (rows.length) {
        unwrap(
            await getLux()
                .table('settings')
                .update(body as never)
                .eq('key', key),
        );
    } else {
        unwrap(
            await getLux()
                .table('settings')
                .insert(body as never),
        );
    }
}

export const getModel = (): Promise<string | null> => get(MODEL_KEY);
export const setModel = (slug: string): Promise<void> => set(MODEL_KEY, slug);

/** The model actually in effect: Lux setting -> env/config default. Use this
 *  anywhere that must match the running model (context window, compaction). */
export async function resolveModel(): Promise<string> {
    return (await getModel().catch(() => null)) ?? loadConfig().model;
}
