import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { createServer } from '../src/server';
import type { DispatchHandle } from '../src/services/harness/dispatch';

let server: ReturnType<typeof createServer>;
let lastInput: { text: string } | null = null;

const fakeStart = async (input: { text: string }): Promise<DispatchHandle> => {
    lastInput = input;
    return { dispatchId: 'disp-123', steered: false, done: Promise.resolve() };
};
const fakeCancel = async (): Promise<string | null> => 'disp-123';

function base(): string {
    return `http://localhost:${server.port}`;
}

beforeAll(() => {
    server = createServer({
        port: 0,
        deps: { startDispatch: fakeStart, cancelActive: fakeCancel },
    });
});
afterAll(() => server.stop(true));

describe('Nero HTTP service', () => {
    test('GET /health', async () => {
        const res = await fetch(`${base()}/health`);
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
    });

    test('GET /v1/config exposes the Lux url + publishable key', async () => {
        const res = await fetch(`${base()}/v1/config`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty('luxUrl');
        expect(body).toHaveProperty('luxPublishableKey');
    });

    test('POST /v1/nero returns a dispatchId', async () => {
        const res = await fetch(`${base()}/v1/nero`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'hello' }),
        });
        expect(res.status).toBe(200);
        expect((await res.json()).dispatchId).toBe('disp-123');
        expect(lastInput?.text).toBe('hello');
    });

    test('POST /v1/nero with no text is a 400', async () => {
        const res = await fetch(`${base()}/v1/nero`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
    });

    test('POST /v1/nero/cancel returns the cancelled id', async () => {
        const res = await fetch(`${base()}/v1/nero/cancel`, { method: 'POST' });
        expect((await res.json()).cancelled).toBe('disp-123');
    });

    test('CORS preflight is handled', async () => {
        const res = await fetch(`${base()}/v1/nero`, { method: 'OPTIONS' });
        expect(res.status).toBe(204);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    test('unknown route is a 404', async () => {
        const res = await fetch(`${base()}/nope`);
        expect(res.status).toBe(404);
    });
});
