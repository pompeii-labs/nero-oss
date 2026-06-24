/**
 * Context-window resolution for OpenRouter model slugs. Prefers the live
 * OpenRouter registry, then a hardcoded FALLBACK, then DEFAULT_CONTEXT. Never
 * throws. Ported from the Vulcan harness.
 */

const REGISTRY_URL = 'https://openrouter.ai/api/v1/models';
const TTL_MS = 60 * 60 * 1000;

/** Conservative window for an unknown slug (registry unreachable and not in
 *  FALLBACK). Small enough that compaction errs toward folding, not overflow. */
export const DEFAULT_CONTEXT = 128_000;

/** Known windows for slugs we run, used only when the live registry can't be
 *  reached. Keep small-window models here so a miss can't over-estimate. */
const FALLBACK: Record<string, number> = {
    'anthropic/claude-sonnet-4.6': 1_000_000,
    'anthropic/claude-sonnet-4.5': 1_000_000,
    'anthropic/claude-sonnet-4': 1_000_000,
    'anthropic/claude-opus-4.8': 1_000_000,
    'anthropic/claude-opus-4.7': 1_000_000,
    'anthropic/claude-opus-4.6': 1_000_000,
    'anthropic/claude-opus-4.5': 200_000,
    'moonshotai/kimi-k2.6': 262_144,
    'moonshotai/kimi-k2': 131_072,
    'google/gemini-2.5-pro': 1_048_576,
    'openai/gpt-4o': 128_000,
};

let cache: { at: number; ctx: Map<string, number> } | null = null;

interface RegistryModel {
    id?: string;
    context_length?: number;
    top_provider?: { context_length?: number };
}

async function loadRegistry(): Promise<Map<string, number> | null> {
    if (cache && Date.now() - cache.at < TTL_MS) return cache.ctx;
    try {
        const res = await fetch(REGISTRY_URL);
        if (!res.ok) return cache?.ctx ?? null;
        const body = (await res.json()) as { data?: RegistryModel[] };
        const ctx = new Map<string, number>();
        for (const m of body.data ?? []) {
            if (typeof m.id !== 'string') continue;
            const cl = m.context_length ?? m.top_provider?.context_length;
            if (typeof cl === 'number' && cl > 0) ctx.set(m.id, cl);
        }
        if (ctx.size === 0) return cache?.ctx ?? null;
        cache = { at: Date.now(), ctx };
        return ctx;
    } catch {
        return cache?.ctx ?? null;
    }
}

/** Strip a trailing `:variant` (e.g. `:nitro`, `:free`); variants share the
 *  base model's window and aren't listed as distinct ids. */
function baseSlug(slug: string): string {
    return slug.trim().replace(/:[^/:]+$/, '');
}

/**
 * Context window (max tokens) for a model slug. Live registry, then FALLBACK,
 * then DEFAULT_CONTEXT. Never throws.
 */
export async function getContextWindow(slug: string): Promise<number> {
    const value = slug.trim();
    const base = baseSlug(value);
    const ctx = await loadRegistry();
    if (ctx) {
        const live = ctx.get(value) ?? ctx.get(base);
        if (live && live > 0) return live;
    }
    return FALLBACK[value] ?? FALLBACK[base] ?? DEFAULT_CONTEXT;
}

/** Test hook: reset the in-memory registry cache. */
export function __resetContextCache(): void {
    cache = null;
}
