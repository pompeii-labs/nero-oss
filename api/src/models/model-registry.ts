import { getLux, unwrap } from '@nero/shared/lux';

/**
 * A registered model endpoint. Populate the registry once (a local llama-server, a
 * custom provider), then each role (base/voice/plan/subagent) can select it by id.
 * A role whose value isn't a registry id is treated as a raw OpenRouter slug.
 */
export interface ModelEntry {
    /** Stable id/slug, e.g. "laguna". Also what a role stores to select it. */
    id: string;
    label: string;
    /** OpenAI-compatible base URL, e.g. http://host.docker.internal:8080/v1 */
    base_url: string;
    /** The model name the endpoint expects, e.g. "laguna-xs-2.1". */
    model: string;
    /** Vault secret name holding the endpoint's API key, or null for none (local). */
    api_key_secret: string | null;
    /** Supports the `enable_thinking` reasoning toggle (llama.cpp chat_template_kwargs). */
    reasoning: boolean;
    created_at?: number;
}

export class ModelRegistry {
    static async list(): Promise<ModelEntry[]> {
        return unwrap(
            await getLux().table('models').select().order('created_at', { ascending: true }),
        ) as unknown as ModelEntry[];
    }

    static async get(id: string): Promise<ModelEntry | null> {
        const rows = unwrap(
            await getLux().table('models').select().eq('id', id).limit(1),
        ) as unknown as ModelEntry[];
        return rows[0] ?? null;
    }

    static async upsert(e: Omit<ModelEntry, 'created_at'>): Promise<ModelEntry> {
        const existing = await ModelRegistry.get(e.id);
        const body: ModelEntry = { ...e, created_at: existing?.created_at ?? Date.now() };
        if (existing) {
            unwrap(
                await getLux()
                    .table('models')
                    .update(body as never)
                    .eq('id', e.id),
            );
        } else {
            unwrap(
                await getLux()
                    .table('models')
                    .insert(body as never),
            );
        }
        return body;
    }

    static async remove(id: string): Promise<void> {
        unwrap(await getLux().table('models').delete().eq('id', id));
    }
}
