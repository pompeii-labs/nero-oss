import { getLux, unwrap } from '@nero/shared/lux';
import { loadConfig } from '@nero/shared/config';
import type { Settings as SettingsRow } from '@nero/shared/types';

export const MODEL_KEY = 'model';

/**
 * Runtime-mutable, single-user config in Lux, keyed by name (not id), so a
 * standalone class. Source of truth for things that change without a restart (the
 * model, etc.). Resolution: Lux setting -> env -> default.
 */
export class Settings {
    /** Read a setting, or null if unset. */
    static async get(key: string): Promise<string | null> {
        const rows = unwrap(
            await getLux().table('settings').select().eq('key', key).limit(1),
        ) as SettingsRow[];
        return rows.length ? (rows[0].value ?? null) : null;
    }

    /** Upsert a setting. */
    static async set(key: string, value: string): Promise<void> {
        const rows = unwrap(
            await getLux().table('settings').select().eq('key', key).limit(1),
        ) as SettingsRow[];
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

    static getModel(): Promise<string | null> {
        return Settings.get(MODEL_KEY);
    }

    static setModel(slug: string): Promise<void> {
        return Settings.set(MODEL_KEY, slug);
    }

    /** The model actually in effect: Lux setting -> env/config default. Use this
     *  anywhere that must match the running model (context window, compaction). */
    static async resolveModel(): Promise<string> {
        return (await Settings.getModel().catch(() => null)) ?? loadConfig().model;
    }
}
