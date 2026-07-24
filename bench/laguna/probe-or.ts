/** Characterize OpenRouter's rate-limit behavior for a model: provider list,
 *  burst vs paced 429 rates, and whether provider-routing settings help. */
const KEY = process.env.OPENROUTER_API_KEY!;
const MODEL = process.env.PROBE_MODEL || 'poolside/laguna-s-2.1';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` };

async function endpoints() {
    const r = await fetch(`https://openrouter.ai/api/v1/models/${MODEL}/endpoints`, { headers: H });
    const j: any = await r.json();
    const eps = j.data?.endpoints ?? [];
    console.log(`providers for ${MODEL}: ${eps.length}`);
    for (const e of eps)
        console.log(
            `  - ${e.provider_name}  ctx=${e.context_length}  in=$${e.pricing?.prompt} out=$${e.pricing?.completion}`,
        );
}

async function one(extra: any = {}): Promise<{ status: number; provider?: string; err?: string }> {
    try {
        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: H,
            body: JSON.stringify({
                model: MODEL,
                messages: [{ role: 'user', content: 'reply with the single word ok' }],
                max_tokens: 5,
                ...extra,
            }),
            signal: AbortSignal.timeout(60000),
        });
        const j: any = await r.json();
        const code = j.error?.code ?? r.status;
        return { status: code, provider: j.provider, err: j.error?.message?.slice(0, 40) };
    } catch (e) {
        return { status: -1, err: String(e).slice(0, 40) };
    }
}

async function burst(label: string, n: number, delayMs: number, extra: any = {}) {
    const codes: Record<string, number> = {};
    const providers: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
        const r = await one(extra);
        codes[r.status] = (codes[r.status] ?? 0) + 1;
        if (r.provider) providers[r.provider] = (providers[r.provider] ?? 0) + 1;
        if (delayMs) await Bun.sleep(delayMs);
    }
    console.log(`${label}: ${JSON.stringify(codes)}  providers=${JSON.stringify(providers)}`);
}

async function main() {
    console.log(`\n=== OpenRouter rate-limit probe :: ${MODEL} ===\n`);
    await endpoints();
    console.log('');
    await burst('burst x15 no delay        ', 15, 0);
    await burst('paced x15 @250ms          ', 15, 250);
    await burst('paced x15 @1000ms         ', 15, 1000);
    await burst('burst x15 fallbacks+nitro ', 15, 0, {
        provider: { allow_fallbacks: true, sort: 'throughput' },
    });
    process.exit(0);
}
main();
