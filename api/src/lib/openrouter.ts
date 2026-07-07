import OpenAI from 'openai';
import { loadConfig } from '@nero/shared/config';

let client: OpenAI | null = null;

/** Shared OpenAI-compatible LLM client. Points at OpenRouter by default, or a local
 *  server (ollama, llama-server) via NERO_LLM_BASE_URL. Singleton, reusable. */
export function openrouter(): OpenAI {
    if (client) return client;
    const cfg = loadConfig();
    client = new OpenAI({
        baseURL: cfg.llm.baseUrl,
        // Dummy key so the SDK constructs when none is set; local servers ignore it.
        apiKey: cfg.llm.apiKey || 'local',
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
