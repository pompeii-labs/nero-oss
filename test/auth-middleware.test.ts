import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { createAuthMiddleware } from '../src/service/middleware/auth';

function createMockReq(overrides: Partial<MockRequest> = {}): MockRequest {
    return {
        hostname: 'tunnel.example.com',
        headers: {},
        ...overrides,
    };
}

interface MockRequest {
    hostname: string;
    headers: Record<string, string>;
}

interface MockResponse {
    statusCode: number;
    jsonData: unknown;
    status: (code: number) => MockResponse;
    json: (data: unknown) => MockResponse;
}

function createMockRes(): MockResponse {
    const res: MockResponse = {
        statusCode: 200,
        jsonData: null,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(data: unknown) {
            this.jsonData = data;
            return this;
        },
    };
    return res;
}

describe('Auth Middleware', () => {
    describe('No License Key Configured', () => {
        test('allows all requests when no license key is set', () => {
            const middleware = createAuthMiddleware(undefined);
            const req = createMockReq();
            const res = createMockRes();
            let nextCalled = false;

            middleware(req as never, res as never, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(true);
        });

        test('allows requests without x-license-key header', () => {
            const middleware = createAuthMiddleware(undefined);
            const req = createMockReq({ headers: {} });
            const res = createMockRes();
            let nextCalled = false;

            middleware(req as never, res as never, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(true);
        });
    });

    describe('License Key Configured', () => {
        const LICENSE_KEY = 'valid-license-key-12345';

        test('allows local requests without key (localhost)', () => {
            const middleware = createAuthMiddleware(LICENSE_KEY);
            const req = createMockReq({ hostname: 'localhost', headers: {} });
            const res = createMockRes();
            let nextCalled = false;

            middleware(req as never, res as never, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(true);
        });

        test('allows local requests without key (localhost with port)', () => {
            const middleware = createAuthMiddleware(LICENSE_KEY);
            const req = createMockReq({
                hostname: 'localhost',
                headers: { host: 'localhost:4848' },
            });
            const res = createMockRes();
            let nextCalled = false;

            middleware(req as never, res as never, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(true);
        });

        test('allows local requests without key (127.0.0.1)', () => {
            const middleware = createAuthMiddleware(LICENSE_KEY);
            const req = createMockReq({ hostname: '127.0.0.1', headers: {} });
            const res = createMockRes();
            let nextCalled = false;

            middleware(req as never, res as never, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(true);
        });

        test('allows same-origin requests without key', () => {
            const middleware = createAuthMiddleware(LICENSE_KEY);
            const req = createMockReq({
                hostname: 'tunnel.example.com',
                headers: { 'sec-fetch-site': 'same-origin' },
            });
            const res = createMockRes();
            let nextCalled = false;

            middleware(req as never, res as never, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(true);
        });

        test('rejects remote requests without key (401)', () => {
            const middleware = createAuthMiddleware(LICENSE_KEY);
            const req = createMockReq({
                hostname: 'tunnel.example.com',
                headers: {},
            });
            const res = createMockRes();
            let nextCalled = false;

            middleware(req as never, res as never, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(false);
            expect(res.statusCode).toBe(401);
            expect(res.jsonData).toEqual({ error: 'License key required' });
        });

        test('rejects requests with invalid key (403)', () => {
            const middleware = createAuthMiddleware(LICENSE_KEY);
            const req = createMockReq({
                hostname: 'tunnel.example.com',
                headers: { 'x-license-key': 'wrong-key' },
            });
            const res = createMockRes();
            let nextCalled = false;

            middleware(req as never, res as never, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(false);
            expect(res.statusCode).toBe(403);
            expect(res.jsonData).toEqual({ error: 'Invalid license key' });
        });

        test('allows requests with valid key', () => {
            const middleware = createAuthMiddleware(LICENSE_KEY);
            const req = createMockReq({
                hostname: 'tunnel.example.com',
                headers: { 'x-license-key': LICENSE_KEY },
            });
            const res = createMockRes();
            let nextCalled = false;

            middleware(req as never, res as never, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(true);
        });

        test('key comparison is case-sensitive', () => {
            const middleware = createAuthMiddleware(LICENSE_KEY);
            const req = createMockReq({
                hostname: 'tunnel.example.com',
                headers: { 'x-license-key': LICENSE_KEY.toUpperCase() },
            });
            const res = createMockRes();
            let nextCalled = false;

            middleware(req as never, res as never, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(false);
            expect(res.statusCode).toBe(403);
        });
    });

    describe('Host Header Bypass Prevention', () => {
        const LICENSE_KEY = 'valid-license-key-12345';

        test('does not allow localhost spoofing via X-Forwarded-Host', () => {
            const middleware = createAuthMiddleware(LICENSE_KEY);
            const req = createMockReq({
                hostname: 'tunnel.example.com',
                headers: {
                    'x-forwarded-host': 'localhost',
                },
            });
            const res = createMockRes();
            let nextCalled = false;

            middleware(req as never, res as never, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(false);
            expect(res.statusCode).toBe(401);
        });

        test('uses req.hostname not req.headers.host for local check', () => {
            const middleware = createAuthMiddleware(LICENSE_KEY);
            const req = createMockReq({
                hostname: 'tunnel.example.com',
                headers: {
                    host: 'localhost:4848',
                },
            });
            const res = createMockRes();
            let nextCalled = false;

            middleware(req as never, res as never, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(false);
            expect(res.statusCode).toBe(401);
        });

        test('rejects cross-origin requests', () => {
            const middleware = createAuthMiddleware(LICENSE_KEY);
            const req = createMockReq({
                hostname: 'tunnel.example.com',
                headers: {
                    'sec-fetch-site': 'cross-site',
                },
            });
            const res = createMockRes();
            let nextCalled = false;

            middleware(req as never, res as never, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(false);
            expect(res.statusCode).toBe(401);
        });
    });

    describe('Edge Cases', () => {
        const LICENSE_KEY = 'test-key';

        test('handles empty hostname gracefully', () => {
            const middleware = createAuthMiddleware(LICENSE_KEY);
            const req = createMockReq({
                hostname: '',
                headers: {},
            });
            const res = createMockRes();
            let nextCalled = false;

            middleware(req as never, res as never, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(false);
            expect(res.statusCode).toBe(401);
        });

        test('handles undefined hostname with host header fallback', () => {
            const middleware = createAuthMiddleware(LICENSE_KEY);
            const req: Partial<MockRequest> = {
                hostname: undefined as unknown as string,
                headers: { host: 'external.com' },
            };
            const res = createMockRes();
            let nextCalled = false;

            middleware(req as never, res as never, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(false);
        });

        test('handles whitespace in license key', () => {
            const middleware = createAuthMiddleware(LICENSE_KEY);
            const req = createMockReq({
                hostname: 'tunnel.example.com',
                headers: { 'x-license-key': ' test-key ' },
            });
            const res = createMockRes();
            let nextCalled = false;

            middleware(req as never, res as never, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(false);
            expect(res.statusCode).toBe(403);
        });

        test('handles empty string as license key header', () => {
            const middleware = createAuthMiddleware(LICENSE_KEY);
            const req = createMockReq({
                hostname: 'tunnel.example.com',
                headers: { 'x-license-key': '' },
            });
            const res = createMockRes();
            let nextCalled = false;

            middleware(req as never, res as never, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(false);
        });
    });
});
