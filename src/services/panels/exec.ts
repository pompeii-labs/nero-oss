import { runShell } from '../../tools/shell';
import { Secret } from '../../models/secret';
import { interpolate } from '../../util/interpolate';
import type { PanelFn } from '../../models/panel';

const TIMEOUT_MS = 15_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        p,
        new Promise<T>((_, rej) => setTimeout(() => rej(new Error('function timed out')), ms)),
    ]);
}

/** Turn a function's raw output into a state patch. With `into`, the value lands
 *  at state[into]; a bare JSON object is merged at the top level; anything else
 *  goes to state.output. */
function toPatch(value: unknown, into?: string): Record<string, unknown> {
    if (into) return { [into]: value };
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return { output: value };
}

function parseMaybeJson(text: string): unknown {
    const t = text.trim();
    try {
        return JSON.parse(t);
    } catch {
        return t;
    }
}

/**
 * Run a panel function (no LLM turn) and return the state patch its output applies.
 * Three kinds:
 *  - shell: run a command, parse stdout (JSON object merged, else raw).
 *  - http:  fetch a URL, parse the response (JSON merged, else raw text).
 *  - js:    run Nero-authored async JS (with `fetch` in scope) that returns a value.
 * In this single-user/local trust model js runs with the same trust as shell (it is
 * not a hardened sandbox) - both let Nero act on the machine on the user's behalf.
 */
export async function runPanelFunction(
    fn: PanelFn,
    secretsOverride?: Record<string, string>,
): Promise<Record<string, unknown>> {
    const secrets = secretsOverride ?? (await Secret.loadMap());

    if (fn.kind === 'shell') {
        // Secrets exposed as env vars ($NAME) for the command.
        const { stdout } = await runShell(fn.cmd, { timeoutMs: TIMEOUT_MS, env: secrets });
        return toPatch(parseMaybeJson(stdout), fn.into);
    }

    if (fn.kind === 'http') {
        // Secrets resolve in the url, headers, and body via ${NAME}.
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(fn.headers ?? {})) headers[k] = interpolate(v, secrets);
        const res = await withTimeout(
            fetch(interpolate(fn.url, secrets), {
                method: fn.method || 'GET',
                headers,
                body: fn.body ? interpolate(fn.body, secrets) : undefined,
            }),
            TIMEOUT_MS,
        );
        const text = await res.text();
        if (!res.ok)
            return { error: `HTTP ${res.status}`, ...toPatch(parseMaybeJson(text), fn.into) };
        return toPatch(parseMaybeJson(text), fn.into);
    }

    if (fn.kind === 'js') {
        // Nero's code runs with `fetch` and `secrets` (the { NAME: value } pool) in
        // scope, e.g. `const r = await fetch(url, { headers: { Authorization: secrets.X } })`.
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        const runner = new Function(
            'fetch',
            'secrets',
            `"use strict"; return (async () => { ${fn.code} })();`,
        ) as (f: typeof fetch, s: Record<string, string>) => Promise<unknown>;
        const result = await withTimeout(runner(fetch, secrets), TIMEOUT_MS);
        return toPatch(result, fn.into);
    }

    return {};
}
