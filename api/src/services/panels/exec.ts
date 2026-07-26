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

/** What a function did, before anyone shapes it for a panel or a dial. */
export interface FnResult {
    ok: boolean;
    /** HTTP status, or a shell exit code. Absent for js. */
    status?: number;
    /** Parsed JSON where the output was JSON, otherwise the raw text. For shell this
     *  is stdout only, so panels (which patch state from it) are unaffected. */
    raw: unknown;
    /** Shell stderr, kept separate: a command can succeed and still say something. */
    stderr?: string;
}

/**
 * Execute one function and report what happened. Shared by panels (which turn the
 * result into a state patch) and dial actions (which want ok/output). Three kinds:
 *  - shell: run a command, parse stdout (JSON object, else raw).
 *  - http:  fetch a URL, parse the response (JSON, else raw text).
 *  - js:    run Nero-authored async JS (with `fetch` in scope) that returns a value.
 * In this single-user/local trust model js runs with the same trust as shell (it is
 * not a hardened sandbox) - both let Nero act on the machine on the user's behalf.
 * Dial actions deliberately never carry `js`.
 */
export async function runFn(
    fn: PanelFn,
    secrets: Record<string, string>,
    timeoutMs: number = TIMEOUT_MS,
): Promise<FnResult> {
    if (fn.kind === 'shell') {
        // Secrets exposed as env vars ($NAME) for the command.
        const r = await runShell(fn.cmd, { timeoutMs, env: secrets });
        return {
            ok: r.code === 0,
            status: r.code,
            raw: parseMaybeJson(r.stdout),
            stderr: r.stderr || undefined,
        };
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
            timeoutMs,
        );
        const text = await res.text();
        return { ok: res.ok, status: res.status, raw: parseMaybeJson(text) };
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
        return { ok: true, raw: await withTimeout(runner(fetch, secrets), timeoutMs) };
    }

    return { ok: false, raw: null };
}

/** Run a panel function (no LLM turn) and return the state patch its output applies. */
export async function runPanelFunction(
    fn: PanelFn,
    secretsOverride?: Record<string, string>,
): Promise<Record<string, unknown>> {
    const secrets = secretsOverride ?? (await Secret.loadMap());
    const r = await runFn(fn, secrets);
    const into = 'into' in fn ? fn.into : undefined;
    // shell previously patched from stdout even on a non-zero exit; http surfaced an
    // `error` key. Both preserved.
    if (fn.kind === 'http' && !r.ok) {
        return { error: `HTTP ${r.status}`, ...toPatch(r.raw, into) };
    }
    return toPatch(r.raw, into);
}
