import OpenAI from 'openai';
import { loadConfig } from '../../config';

// Embeddings via OpenRouter's OpenAI-compatible /embeddings endpoint (verified
// to work with the platform OPENROUTER_API_KEY - no separate OpenAI key).
// text-embedding-3-small is 1536-dim and cheap. Returns null when no key is
// configured so memory degrades to a no-op rather than throwing.
const MAX_INPUT_CHARS = 8_000;

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
    const cfg = loadConfig();
    if (!cfg.openrouter.apiKey) return null;
    if (!client) {
        client = new OpenAI({
            baseURL: cfg.openrouter.baseUrl,
            apiKey: cfg.openrouter.apiKey,
            timeout: 30_000,
            maxRetries: 2,
        });
    }
    return client;
}

export async function embed(text: string): Promise<number[] | null> {
    const c = getClient();
    if (!c) return null;
    const input = text.trim().slice(0, MAX_INPUT_CHARS);
    if (!input) return null;
    try {
        const res = await c.embeddings.create({ model: loadConfig().embedModel, input });
        return res.data[0]?.embedding ?? null;
    } catch (e) {
        console.error('[nero] embed failed:', e);
        return null;
    }
}

/** Test hook. */
export function __resetEmbedClient(): void {
    client = null;
}
