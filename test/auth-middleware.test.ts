import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { createAuthMiddleware } from '../src/service/middleware/auth';

interface MockRequest {
    hostname: string;
    headers: Record<string, string>;
    socket: { remoteAddress?: string };
    ip?: string;
}

function createMockReq(overrides: Partial<MockRequest> = {}): MockRequest {
    return {
        hostname: 'tunnel.example.com',
        headers: {},
        socket: { remoteAddress: '203.0.113.1' },
        ...overrides,
    };
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

        test('allows local requests without key (127.0.0.1)', () => {
            const middleware = createAuthMiddleware(LICENSE_KEY);
            const req = createMockReq({
                socket: { remoteAddress: '127.0.0.1' },
                headers: {},
            });
            const res = createMockRes();
            let nextCalled = false;

            middleware(req as never, res as never, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(true);
        });

        test('allows local requests without key (::1)', () => {
            const middleware = createAuthMiddleware(LICENSE_KEY);
            const req = createMockReq({
                socket: { remoteAddress: '::1' },
                headers: {},
            });
            const res = createMockRes();
            let nextCalled = false;

            middleware(req as never, res as never, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(true);
        });

        test('allows local requests without key (::ffff:127.0.0.1)', () => {
            const middleware = createAuthMiddleware(LICENSE_KEY);
            const req = createMockReq({
                socket: { remoteAddress: '::ffff:127.0.0.1' },
                headers: {},
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
                socket: { remoteAddress: '203.0.113.1' },
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
                socket: { remoteAddress: '203.0.113.1' },
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

        test('does not allow localhost spoofing via Host header', () => {
            const middleware = createAuthMiddleware(LICENSE_KEY);
            const req = createMockReq({
                socket: { remoteAddress: '203.0.113.1' },
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

        test('rejects remote requests regardless of sec-fetch-site', () => {
            const middleware = createAuthMiddleware(LICENSE_KEY);
            const req = createMockReq({
                socket: { remoteAddress: '203.0.113.1' },
                headers: {
                    'sec-fetch-site': 'same-origin',
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

        test('handles missing remoteAddress gracefully', () => {
            const middleware = createAuthMiddleware(LICENSE_KEY);
            const req = createMockReq({
                socket: { remoteAddress: undefined },
                ip: '',
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

        test('falls back to req.ip when remoteAddress is empty', () => {
            const middleware = createAuthMiddleware(LICENSE_KEY);
            const req = createMockReq({
                socket: { remoteAddress: '' },
                ip: '127.0.0.1',
                headers: {},
            });
            const res = createMockRes();
            let nextCalled = false;

            middleware(req as never, res as never, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(true);
        });

        test('handles whitespace in license key', () => {
            const middleware = createAuthMiddleware(LICENSE_KEY);
            const req = createMockReq({
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
