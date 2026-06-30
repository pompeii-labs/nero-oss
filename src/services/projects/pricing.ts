/**
 * Token -> USD for a model, used to meter project spend against the approved budget.
 * Live OpenRouter pricing (cached), then a fallback map, then a conservative default.
 */
const REGISTRY_URL = 'https://openrouter.ai/api/v1/models';
const TTL_MS = 6 * 60 * 60 * 1000;

export interface Price {
    in: number; // USD per input token
    out: number; // USD per output token
}

// Per-token USD (about $/Mtok / 1e6) for slugs we commonly run; used if the live
// registry is unreachable. Conservative-ish; the live values override these.
const FALLBACK: Record<string, Price> = {
    'anthropic/claude-sonnet-4.5': { in: 3e-6, out: 15e-6 },
    'anthropic/claude-sonnet-4.6': { in: 3e-6, out: 15e-6 },
    'anthropic/claude-haiku-4.5': { in: 1e-6, out: 5e-6 },
    'anthropic/claude-opus-4.8': { in: 15e-6, out: 75e-6 },
    'openai/gpt-4.1-mini': { in: 0.4e-6, out: 1.6e-6 },
};
const DEFAULT: Price = { in: 3e-6, out: 15e-6 };

export class Pricing {
    private static cache: { at: number; prices: Map<string, Price> } | null = null;

    private static base(slug: string): string {
        return slug.trim().replace(/:[^/:]+$/, '');
    }

    private static async loadPrices(): Promise<Map<string, Price> | null> {
        if (Pricing.cache && Date.now() - Pricing.cache.at < TTL_MS) return Pricing.cache.prices;
        try {
            const res = await fetch(REGISTRY_URL);
            if (!res.ok) return Pricing.cache?.prices ?? null;
            const body = (await res.json()) as {
                data?: { id?: string; pricing?: { prompt?: string; completion?: string } }[];
            };
            const prices = new Map<string, Price>();
            for (const m of body.data ?? []) {
                if (typeof m.id !== 'string' || !m.pricing) continue;
                const inP = Number(m.pricing.prompt);
                const outP = Number(m.pricing.completion);
                if (Number.isFinite(inP) && Number.isFinite(outP))
                    prices.set(m.id, { in: inP, out: outP });
            }
            if (prices.size === 0) return Pricing.cache?.prices ?? null;
            Pricing.cache = { at: Date.now(), prices };
            return prices;
        } catch {
            return Pricing.cache?.prices ?? null;
        }
    }

    static async priceFor(model: string): Promise<Price> {
        const prices = await Pricing.loadPrices();
        return (
            prices?.get(model) ??
            prices?.get(Pricing.base(model)) ??
            FALLBACK[Pricing.base(model)] ??
            DEFAULT
        );
    }

    /** USD cost of a run given its token counts. */
    static async costUsd(model: string, inTokens: number, outTokens: number): Promise<number> {
        const p = await Pricing.priceFor(model);
        return inTokens * p.in + outTokens * p.out;
    }

    /** Test hook. */
    static reset(): void {
        Pricing.cache = null;
    }
}
