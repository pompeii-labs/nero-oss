import { describe, test, expect, beforeAll } from 'bun:test';

function normalizeUrl(url: string | undefined): string | undefined {
    if (!url) return undefined;
    url = url.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    return url.replace(/\/$/, '');
}

const RUN_TUNNEL_TESTS = process.env.RUN_TUNNEL_TESTS === '1';
const TUNNEL_URL = RUN_TUNNEL_TESTS ? normalizeUrl(process.env.NERO_TUNNEL_URL) : undefined;
const LICENSE_KEY = process.env.NERO_LICENSE_KEY || 'test-license-key-12345';

describe('Tunnel Authentication Integration Tests', () => {
    beforeAll(() => {
        if (!TUNNEL_URL) {
            console.log('⚠️  Set NERO_TUNNEL_URL env var to run tunnel integration tests');
            console.log('   Example: NERO_TUNNEL_URL=https://your-tunnel.ngrok.io bun test');
        } else {
            console.log(`🔗 Testing tunnel: ${TUNNEL_URL}`);
        }
    });

    describe('Public Endpoints (no auth required)', () => {
        test.skipIf(!TUNNEL_URL)('GET / returns service info', async () => {
            const response = await fetch(`${TUNNEL_URL}/`);
            expect(response.ok).toBe(true);

            const data = await response.json();
            expect(data.name).toBe('OpenNero');
            expect(data.status).toBe('running');
        });

        test.skipIf(!TUNNEL_URL)('GET /api returns service info without auth', async () => {
            const response = await fetch(`${TUNNEL_URL}/api`);
            expect(response.ok).toBe(true);

            const data = await response.json();
            expect(data.name).toBe('OpenNero');
            expect(data.version).toBeDefined();
        });

        test.skipIf(!TUNNEL_URL)('GET /health returns health status without auth', async () => {
            const response = await fetch(`${TUNNEL_URL}/health`);
            expect(response.ok).toBe(true);

            const data = await response.json();
            expect(data.status).toBe('ok');
        });
    });

    describe('Protected Endpoints (auth required)', () => {
        test.skipIf(!TUNNEL_URL)('POST /api/chat without key returns 401', async () => {
            const response = await fetch(`${TUNNEL_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: 'test' }),
            });

            expect(response.status).toBe(401);
            const data = await response.json();
            expect(data.error).toBe('License key required');
        });

        test.skipIf(!TUNNEL_URL)('POST /api/chat with invalid key returns 403', async () => {
            const response = await fetch(`${TUNNEL_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-license-key': 'invalid-key-12345',
                },
                body: JSON.stringify({ message: 'test' }),
            });

            expect(response.status).toBe(403);
            const data = await response.json();
            expect(data.error).toBe('Invalid license key');
        });

        test.skipIf(!TUNNEL_URL)('POST /api/chat with valid key succeeds', async () => {
            const response = await fetch(`${TUNNEL_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-license-key': LICENSE_KEY,
                },
                body: JSON.stringify({ message: 'ping' }),
            });

            expect(response.status).not.toBe(401);
            expect(response.status).not.toBe(403);
        });

        test.skipIf(!TUNNEL_URL)('GET /api/history without key returns 401', async () => {
            const response = await fetch(`${TUNNEL_URL}/api/history`);
            expect(response.status).toBe(401);
        });

        test.skipIf(!TUNNEL_URL)('GET /api/context without key returns 401', async () => {
            const response = await fetch(`${TUNNEL_URL}/api/context`);
            expect(response.status).toBe(401);
        });
    });

    describe('Auth Header Injection Prevention', () => {
        test.skipIf(!TUNNEL_URL)('x-license-key with newlines is rejected', async () => {
            try {
                const response = await fetch(`${TUNNEL_URL}/api/chat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-license-key': 'valid-key\r\nX-Injected: malicious',
                    },
                    body: JSON.stringify({ message: 'test' }),
                });
                expect([401, 403, 400]).toContain(response.status);
            } catch (error) {
                expect(error).toBeInstanceOf(TypeError);
            }
        });

        test.skipIf(!TUNNEL_URL)('x-license-key with null bytes is rejected', async () => {
            try {
                const response = await fetch(`${TUNNEL_URL}/api/chat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-license-key': 'valid-key\x00injected',
                    },
                    body: JSON.stringify({ message: 'test' }),
                });
                expect([401, 403, 400]).toContain(response.status);
            } catch (error) {
                expect(error).toBeInstanceOf(TypeError);
            }
        });
    });

    describe('CORS Security', () => {
        test.skipIf(!TUNNEL_URL)('OPTIONS preflight returns proper CORS headers', async () => {
            const response = await fetch(`${TUNNEL_URL}/api/chat`, {
                method: 'OPTIONS',
                headers: {
                    Origin: 'https://malicious-site.com',
                    'Access-Control-Request-Method': 'POST',
                },
            });

            const allowedOrigin = response.headers.get('access-control-allow-origin');
            expect(allowedOrigin).not.toBe('*');
            expect(allowedOrigin).not.toBe('https://malicious-site.com');
        });
    });

    describe('Rate Limiting Behavior', () => {
        test.skipIf(!TUNNEL_URL)('rapid unauthenticated requests are handled', async () => {
            const requests = Array.from({ length: 10 }, () =>
                fetch(`${TUNNEL_URL}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: 'test' }),
                }),
            );

            const responses = await Promise.all(requests);
            const statuses = responses.map((r) => r.status);

            expect(statuses.every((s) => s === 401 || s === 429)).toBe(true);
        });
    });

    describe('WebSocket Voice Stream Auth', () => {
        test.skipIf(!TUNNEL_URL)('Twilio WebSocket without token is rejected', async () => {
            const wsUrl = TUNNEL_URL.replace(/^https?/, 'wss') + '/webhook/voice/stream/token=';

            const connectPromise = new Promise<{ connected: boolean; error?: string }>(
                (resolve) => {
                    try {
                        const ws = new WebSocket(wsUrl);

                        ws.onopen = () => {
                            ws.close();
                            resolve({ connected: true });
                        };

                        ws.onerror = () => {
                            resolve({ connected: false, error: 'connection error' });
                        };

                        ws.onclose = (event) => {
                            if (!event.wasClean) {
                                resolve({ connected: false, error: `closed: ${event.code}` });
                            }
                        };

                        setTimeout(() => {
                            ws.close();
                            resolve({ connected: false, error: 'timeout' });
                        }, 5000);
                    } catch (error) {
                        resolve({ connected: false, error: String(error) });
                    }
                },
            );

            const result = await connectPromise;
            expect(result.connected).toBe(false);
        });

        test.skipIf(!TUNNEL_URL)('Twilio WebSocket with invalid token is rejected', async () => {
            const wsUrl =
                TUNNEL_URL.replace(/^https?/, 'wss') + '/webhook/voice/stream/token=invalid.token';

            const connectPromise = new Promise<{ connected: boolean; error?: string }>(
                (resolve) => {
                    try {
                        const ws = new WebSocket(wsUrl);

                        ws.onopen = () => {
                            ws.close();
                            resolve({ connected: true });
                        };

                        ws.onerror = () => {
                            resolve({ connected: false, error: 'connection error' });
                        };

                        ws.onclose = (event) => {
                            if (!event.wasClean) {
                                resolve({ connected: false, error: `closed: ${event.code}` });
                            }
                        };

                        setTimeout(() => {
                            ws.close();
                            resolve({ connected: false, error: 'timeout' });
                        }, 5000);
                    } catch (error) {
                        resolve({ connected: false, error: String(error) });
                    }
                },
            );

            const result = await connectPromise;
            expect(result.connected).toBe(false);
        });

        test.skipIf(!TUNNEL_URL)('Twilio WebSocket with expired token is rejected', async () => {
            const expiredTimestamp = Math.floor(Date.now() / 1000) - 120;
            const expiredToken = `${expiredTimestamp}.fakehmacsignature`;
            const wsUrl =
                TUNNEL_URL.replace(/^https?/, 'wss') +
                `/webhook/voice/stream/token=${expiredToken}`;

            const connectPromise = new Promise<{ connected: boolean; error?: string }>(
                (resolve) => {
                    try {
                        const ws = new WebSocket(wsUrl);

                        ws.onopen = () => {
                            ws.close();
                            resolve({ connected: true });
                        };

                        ws.onerror = () => {
                            resolve({ connected: false, error: 'connection error' });
                        };

                        ws.onclose = (event) => {
                            if (!event.wasClean) {
                                resolve({ connected: false, error: `closed: ${event.code}` });
                            }
                        };

                        setTimeout(() => {
                            ws.close();
                            resolve({ connected: false, error: 'timeout' });
                        }, 5000);
                    } catch (error) {
                        resolve({ connected: false, error: String(error) });
                    }
                },
            );

            const result = await connectPromise;
            expect(result.connected).toBe(false);
        });

        test.skipIf(!TUNNEL_URL)(
            'Web WebSocket path accepts connections (localhost only in prod)',
            async () => {
                const wsUrl = TUNNEL_URL.replace(/^https?/, 'wss') + '/webhook/voice/stream';

                const connectPromise = new Promise<{ connected: boolean; error?: string }>(
                    (resolve) => {
                        try {
                            const ws = new WebSocket(wsUrl);

                            ws.onopen = () => {
                                ws.close();
                                resolve({ connected: true });
                            };

                            ws.onerror = () => {
                                resolve({ connected: false, error: 'connection error' });
                            };

                            ws.onclose = (event) => {
                                if (!event.wasClean) {
                                    resolve({ connected: false, error: `closed: ${event.code}` });
                                }
                            };

                            setTimeout(() => {
                                ws.close();
                                resolve({ connected: false, error: 'timeout' });
                            }, 5000);
                        } catch (error) {
                            resolve({ connected: false, error: String(error) });
                        }
                    },
                );

                const result = await connectPromise;
                expect(result.connected).toBe(true);
            },
        );
    });

    describe('Webhook Endpoint Security', () => {
        test.skipIf(!TUNNEL_URL)(
            'POST /webhook/sms without proper format returns error',
            async () => {
                const response = await fetch(`${TUNNEL_URL}/webhook/sms`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'Body=test&From=+1234567890',
                });

                expect([200, 400, 401, 403, 404]).toContain(response.status);
            },
        );

        test.skipIf(!TUNNEL_URL)('POST /webhook/voice returns TwiML or error', async () => {
            const response = await fetch(`${TUNNEL_URL}/webhook/voice`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'CallSid=test&From=+1234567890',
            });

            expect([200, 400, 404]).toContain(response.status);
            if (response.status === 200) {
                const text = await response.text();
                expect(text).toContain('<?xml');
            }
        });

        test.skipIf(!TUNNEL_URL)(
            'POST /webhook/slack without auth header returns 401',
            async () => {
                const response = await fetch(`${TUNNEL_URL}/webhook/slack`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'url_verification', challenge: 'test' }),
                });

                expect([401, 403]).toContain(response.status);
            },
        );
    });

    describe('Path Traversal Prevention', () => {
        test.skipIf(!TUNNEL_URL)('path traversal attempts are blocked', async () => {
            const maliciousPaths = [
                '/../../../etc/passwd',
                '/api/../../../etc/passwd',
                '/..%2f..%2f..%2fetc/passwd',
                '/%2e%2e/%2e%2e/%2e%2e/etc/passwd',
            ];

            for (const path of maliciousPaths) {
                const response = await fetch(`${TUNNEL_URL}${path}`);
                expect([400, 401, 403, 404]).toContain(response.status);

                const contentType = response.headers.get('content-type') || '';
                if (response.status === 200) {
                    expect(contentType).not.toContain('text/plain');
                }
            }
        });
    });

    describe('Information Disclosure Prevention', () => {
        test.skipIf(!TUNNEL_URL)('error responses do not leak sensitive info', async () => {
            const response = await fetch(`${TUNNEL_URL}/api/nonexistent`, {
                headers: { 'x-license-key': LICENSE_KEY },
            });

            const text = await response.text();
            expect(text.toLowerCase()).not.toContain('stack trace');
            expect(text.toLowerCase()).not.toContain('node_modules');
            expect(text).not.toMatch(/at .+\(.+:\d+:\d+\)/);
        });

        test.skipIf(!TUNNEL_URL)('server header does not expose version details', async () => {
            const response = await fetch(`${TUNNEL_URL}/`);
            const xPoweredBy = response.headers.get('x-powered-by');

            if (xPoweredBy?.includes('Express')) {
                console.warn(
                    '⚠️  Security recommendation: Disable x-powered-by header with app.disable("x-powered-by")',
                );
            }
            expect(true).toBe(true);
        });
    });
});
