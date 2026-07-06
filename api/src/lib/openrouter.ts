import OpenAI from 'openai';
import { loadConfig } from '@nero/shared/config';

let client: OpenAI | null = null;

/** Shared OpenRouter (OpenAI-compatible) client. Stateless and reusable, so a
 *  singleton rather than one per agent. */
export function openrouter(): OpenAI {
    if (client) return client;
    const cfg = loadConfig();
    client = new OpenAI({
        baseURL: cfg.openrouter.baseUrl,
        apiKey: cfg.openrouter.apiKey,
        timeout: 120_000,
        maxRetries: 2,
        defaultHeaders: { 'X-Title': 'Nero' },
    });
    return client;
}

/** Test hook: drop the memoized client. */
export function __resetOpenRouter(): void {
    client = null;
}
