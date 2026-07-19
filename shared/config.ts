/**
 * The single default every model role (base / voice / planning / subagents) falls
 * back to. Per-role overrides live in the `settings` table (no env). See
 * `Settings.resolve*Model()`.
 */
export const DEFAULT_MODEL = 'openai/gpt-5.6-terra';

/**
 * Nero configuration. Single-user. LLM connection is env-driven; model *selection*
 * is not — it lives in the `settings` table (see Settings.resolve*Model).
 */
export interface NeroConfig {
    // The LLM connection. OpenAI-compatible, so it can point at OpenRouter (default)
    // or a local server (ollama, llama-server): set NERO_LLM_BASE_URL.
    llm: { apiKey: string; baseUrl: string };
    // The base-model fallback (== DEFAULT_MODEL). Per-role overrides live in settings.
    model: string;
    // Embeddings stay separate from the LLM: a local LLM server usually has no
    // embedding model, so memory recall keeps using OpenRouter unless overridden.
    embed: { apiKey: string; baseUrl: string; model: string };
    lux: {
        url: string;
        publicUrl: string;
        directUrl: string;
        secretKey: string;
        publishableKey: string;
    };
    tavilyApiKey: string;
    port: number;
    timezone: string;
    voice: { mediaBridgeUrl: string };
}

function env(name: string, fallback?: string): string {
    const v = process.env[name];
    if (v === undefined || v === '') return fallback ?? '';
    return v;
}

let cached: NeroConfig | null = null;

export function loadConfig(): NeroConfig {
    if (cached) return cached;
    const llmBaseUrl =
        env('NERO_LLM_BASE_URL') || env('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1');
    cached = {
        llm: {
            apiKey: env('NERO_LLM_API_KEY') || env('OPENROUTER_API_KEY'),
            baseUrl: llmBaseUrl,
        },
        model: DEFAULT_MODEL,
        embed: {
            apiKey: env('NERO_EMBED_API_KEY') || env('OPENROUTER_API_KEY'),
            baseUrl:
                env('NERO_EMBED_BASE_URL') ||
                env('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
            model: env('NERO_EMBED_MODEL', 'openai/text-embedding-3-small'),
        },
        tavilyApiKey: env('TAVILY_API_KEY'),
        lux: {
            url: env('LUX_URL', 'http://localhost:8090'),
            // What the SPA connects to. Explicit override wins; else if LUX_URL is the
            // compose-internal `lux` host it's not browser-reachable, so serve '' and the
            // SPA uses the same-origin nginx /lux proxy. In dev LUX_URL is localhost, so
            // the browser can hit it directly.
            publicUrl:
                env('NERO_PUBLIC_LUX_URL') ||
                (env('LUX_URL', 'http://localhost:8090').includes('//lux:')
                    ? ''
                    : env('LUX_URL', 'http://localhost:8090')),
            // RESP/Redis endpoint (lux:// or rediss://) for BullMQ - the project queue.
            directUrl: env('LUX_DIRECT_URL'),
            secretKey: env('LUX_SECRET_KEY'),
            publishableKey: env('LUX_PUBLISHABLE_KEY'),
        },
        port: Number(env('NERO_PORT', '4848')),
        voice: { mediaBridgeUrl: env('NERO_MEDIA_URL', 'ws://localhost:7070') },
        timezone: env('NERO_TIMEZONE') || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    };
    return cached;
}

/** Test hook: clear the memoized config so env changes take effect. */
export function __resetConfig(): void {
    cached = null;
}
