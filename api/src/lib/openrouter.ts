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
        defaultHeaders: cfg.llm.baseUrl.includes('openrouter.ai')
            ? { 'X-Title': 'Nero', 'HTTP-Referer': 'https://nero.pompeiilabs.com' }
            : {},
    });
    return client;
}

const clients = new Map<string, OpenAI>();

/** An OpenAI-compatible client for an arbitrary endpoint (a registered model's base
 *  URL + key, or the OpenRouter default). Memoized per (baseUrl, key). Generous timeout
 *  since local reasoning models can stream for minutes. */
export function clientFor(baseUrl: string, apiKey: string): OpenAI {
    const k = `${baseUrl}::${apiKey}`;
    let c = clients.get(k);
    if (!c) {
        c = new OpenAI({
            baseURL: baseUrl,
            apiKey: apiKey || 'local',
            timeout: 300_000,
            maxRetries: 2,
            defaultHeaders: baseUrl.includes('openrouter.ai')
                ? { 'X-Title': 'Nero', 'HTTP-Referer': 'https://nero.pompeiilabs.com' }
                : {},
        });
        clients.set(k, c);
    }
    return c;
}

/** Test hook: drop the memoized client. */
export function __resetOpenRouter(): void {
    client = null;
    clients.clear();
}
