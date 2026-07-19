import { getLux, unwrap } from '@nero/shared/lux';
import { DEFAULT_MODEL } from '@nero/shared/config';
import type { Settings as SettingsRow } from '@nero/shared/types';

/** Per-role model settings keys. Every role falls back to DEFAULT_MODEL (no env). */
export const MODEL_KEY = 'model'; // base / chat
export const VOICE_MODEL_KEY = 'voice_model';
export const PLAN_MODEL_KEY = 'plan_model';
export const SUBAGENT_MODEL_KEY = 'subagent_model';

export type ModelRole = 'model' | 'voice_model' | 'plan_model' | 'subagent_model';

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

    /** A role's model: its `settings` value, else DEFAULT_MODEL. No env. */
    private static async resolve(key: ModelRole): Promise<string> {
        return (await Settings.get(key).catch(() => null))?.trim() || DEFAULT_MODEL;
    }

    /** The base/chat model in effect. Use anywhere that must match it (context
     *  window, compaction). */
    static resolveModel(): Promise<string> {
        return Settings.resolve(MODEL_KEY);
    }
    static resolveVoiceModel(): Promise<string> {
        return Settings.resolve(VOICE_MODEL_KEY);
    }
    static resolvePlanModel(): Promise<string> {
        return Settings.resolve(PLAN_MODEL_KEY);
    }
    static resolveSubagentModel(): Promise<string> {
        return Settings.resolve(SUBAGENT_MODEL_KEY);
    }

    /** All four roles resolved (for the Models settings UI). */
    static async resolveAllModels(): Promise<{
        model: string;
        voiceModel: string;
        planModel: string;
        subagentModel: string;
    }> {
        const [model, voiceModel, planModel, subagentModel] = await Promise.all([
            Settings.resolveModel(),
            Settings.resolveVoiceModel(),
            Settings.resolvePlanModel(),
            Settings.resolveSubagentModel(),
        ]);
        return { model, voiceModel, planModel, subagentModel };
    }
}
