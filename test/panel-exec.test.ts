import { describe, test, expect, afterEach } from 'bun:test';
import { runPanelFunction } from '../src/panels/exec';
import type { PanelFn } from '../src/models/panel';

const NO_SECRETS: Record<string, string> = {};

// Stub global fetch per-test; restore after each.
const realFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = realFetch;
});
function stubFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
    globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) =>
        Promise.resolve(impl(String(url), init))) as typeof fetch;
}

describe('runPanelFunction — shell', () => {
    test('merges a JSON object from stdout into state', async () => {
        const fn: PanelFn = { kind: 'shell', cmd: `echo '{"cpu":42,"mem":"3GB"}'` };
        expect(await runPanelFunction(fn, NO_SECRETS)).toEqual({ cpu: 42, mem: '3GB' });
    });

    test('with `into`, raw stdout goes to state[into]', async () => {
        const fn: PanelFn = { kind: 'shell', cmd: `echo hello`, into: 'out' };
        expect(await runPanelFunction(fn, NO_SECRETS)).toEqual({ out: 'hello' });
    });

    test('non-JSON stdout lands at state.output', async () => {
        const fn: PanelFn = { kind: 'shell', cmd: `echo not-json` };
        expect(await runPanelFunction(fn, NO_SECRETS)).toEqual({ output: 'not-json' });
    });

    test('secrets are exposed as env vars', async () => {
        const fn: PanelFn = { kind: 'shell', cmd: `echo "$MY_TOKEN"`, into: 'tok' };
        expect(await runPanelFunction(fn, { MY_TOKEN: 's3cr3t' })).toEqual({ tok: 's3cr3t' });
    });
});

describe('runPanelFunction — http', () => {
    test('parses a JSON object response and merges it', async () => {
        stubFetch(() => new Response(JSON.stringify({ price: 100 }), { status: 200 }));
        const fn: PanelFn = { kind: 'http', url: 'https://api.test/x' };
        expect(await runPanelFunction(fn, NO_SECRETS)).toEqual({ price: 100 });
    });

    test('interpolates secrets into url, headers, body', async () => {
        let seenUrl = '';
        let seenAuth = '';
        let seenBody: string | undefined;
        stubFetch((url, init) => {
            seenUrl = url;
            seenAuth = (init?.headers as Record<string, string>)?.Authorization ?? '';
            seenBody = init?.body as string | undefined;
            return new Response('{"ok":true}', { status: 200 });
        });
        const fn: PanelFn = {
            kind: 'http',
            url: 'https://api.test/${REGION}/data',
            method: 'POST',
            headers: { Authorization: 'Bearer ${API_KEY}' },
            body: 'key=${API_KEY}',
        };
        await runPanelFunction(fn, { API_KEY: 'abc', REGION: 'us' });
        expect(seenUrl).toBe('https://api.test/us/data');
        expect(seenAuth).toBe('Bearer abc');
        expect(seenBody).toBe('key=abc');
    });

    test('non-200 surfaces an error key', async () => {
        stubFetch(() => new Response('nope', { status: 503 }));
        const fn: PanelFn = { kind: 'http', url: 'https://api.test/x', into: 'raw' };
        const out = await runPanelFunction(fn, NO_SECRETS);
        expect(out.error).toBe('HTTP 503');
        expect(out.raw).toBe('nope');
    });

    test('throws if a referenced secret is missing', async () => {
        stubFetch(() => new Response('{}', { status: 200 }));
        const fn: PanelFn = { kind: 'http', url: 'https://api.test/${MISSING}' };
        expect(runPanelFunction(fn, NO_SECRETS)).rejects.toThrow('Missing secret "MISSING"');
    });
});

describe('runPanelFunction — js', () => {
    test('returns an object that merges into state', async () => {
        const fn: PanelFn = { kind: 'js', code: 'return { a: 1, b: 2 };' };
        expect(await runPanelFunction(fn, NO_SECRETS)).toEqual({ a: 1, b: 2 });
    });

    test('has `secrets` in scope', async () => {
        const fn: PanelFn = { kind: 'js', code: 'return { token: secrets.API_KEY };' };
        expect(await runPanelFunction(fn, { API_KEY: 'xyz' })).toEqual({ token: 'xyz' });
    });

    test('has `fetch` in scope and can await it', async () => {
        stubFetch(() => new Response(JSON.stringify({ temp: 71 }), { status: 200 }));
        const fn: PanelFn = {
            kind: 'js',
            code: 'const r = await fetch("https://api.test/w"); const d = await r.json(); return { temp: d.temp };',
        };
        expect(await runPanelFunction(fn, NO_SECRETS)).toEqual({ temp: 71 });
    });

    test('with `into`, the returned value is wrapped', async () => {
        const fn: PanelFn = { kind: 'js', code: 'return [1,2,3];', into: 'series' };
        expect(await runPanelFunction(fn, NO_SECRETS)).toEqual({ series: [1, 2, 3] });
    });

    test('a thrown error propagates (caller handles it)', async () => {
        const fn: PanelFn = { kind: 'js', code: 'throw new Error("boom");' };
        expect(runPanelFunction(fn, NO_SECRETS)).rejects.toThrow('boom');
    });
});
