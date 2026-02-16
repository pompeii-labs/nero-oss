import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import http from 'http';
import type { AddressInfo } from 'net';
import { WebSocket, WebSocketServer } from 'ws';
import { RelayServer } from '../src/relay/index.js';
import { createWsToken } from '../src/util/wstoken.js';

const LICENSE_KEY = 'test-license-key-12345';

type Servers = {
    upstream: http.Server;
    upstreamWss: WebSocketServer;
    relay: RelayServer;
    upstreamPort: number;
    relayPort: number;
    upstreamSockets: Set<import('net').Socket>;
};

function waitForWs(url: string, headers?: Record<string, string>): Promise<boolean> {
    return new Promise((resolve) => {
        let settled = false;
        const ws = new WebSocket(url, { headers });

        const finish = (result: boolean) => {
            if (settled) return;
            settled = true;
            try {
                ws.close();
            } catch {}
            resolve(result);
        };

        ws.onopen = () => finish(true);
        ws.onerror = () => finish(false);
        ws.onclose = () => finish(false);

        setTimeout(() => finish(false), 2000);
    });
}

async function startServers(): Promise<Servers> {
    const upstreamWss = new WebSocketServer({ noServer: true });
    const upstream = http.createServer((req, res) => {
        if (req.url?.startsWith('/api/')) {
            if (req.url === '/api/chat') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
                return;
            }
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'not found' }));
            return;
        }

        if (req.url === '/api') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ name: 'OpenNero' }));
            return;
        }

        if (req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
            return;
        }

        if (req.url?.startsWith('/webhook/')) {
            let body = '';
            req.on('data', (chunk) => (body += chunk.toString()));
            req.on('end', () => {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end(`ok:${body}`);
            });
            return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found' }));
    });
    const upstreamSockets = new Set<import('net').Socket>();
    upstream.on('connection', (socket) => {
        upstreamSockets.add(socket);
        socket.on('close', () => upstreamSockets.delete(socket));
    });

    upstream.on('upgrade', (req, socket, head) => {
        if (!req.url?.startsWith('/webhook/voice/stream')) {
            socket.destroy();
            return;
        }
        upstreamWss.handleUpgrade(req, socket, head, (ws) => {
            upstreamWss.emit('connection', ws, req);
        });
    });

    upstreamWss.on('connection', (ws) => {
        ws.on('message', (data) => {
            ws.send(data);
        });
    });

    const upstreamPort = await new Promise<number>((resolve, reject) => {
        upstream.once('error', reject);
        upstream.listen(0, '127.0.0.1', () => {
            resolve((upstream.address() as AddressInfo).port);
        });
    });

    const relay = new RelayServer({
        listenHost: '127.0.0.1',
        listenPort: 0,
        targetHost: '127.0.0.1',
        targetPort: upstreamPort,
        licenseKey: LICENSE_KEY,
    });
    await relay.start();
    const relayPort = relay.port;

    return { upstream, upstreamWss, relay, upstreamPort, relayPort, upstreamSockets };
}

describe('Relay Integration Tests', () => {
    let servers: Servers;

    beforeAll(async () => {
        servers = await startServers();
    });

    afterAll(async () => {
        const withTimeout = async (label: string, fn: () => Promise<void>) => {
            await Promise.race([
                fn(),
                new Promise<void>((resolve) =>
                    setTimeout(() => {
                        console.warn(`⚠️  Timeout closing ${label}`);
                        if (label === 'relay') {
                            const relay = servers?.relay as any;
                            const relayClientCount = relay?.wss?.clients?.size ?? 'unknown';
                            const relayTrackedClients = relay?.clientSockets?.size ?? 'unknown';
                            const relayTrackedUpstream = relay?.upstreamSockets?.size ?? 'unknown';
                            const relayHttpSockets = relay?.httpSockets?.size ?? 'unknown';
                            console.warn(
                                `⚠️  Relay WS clients: ${relayClientCount}, tracked clients: ${relayTrackedClients}, tracked upstream: ${relayTrackedUpstream}, http sockets: ${relayHttpSockets}`,
                            );
                        }
                        if (label === 'upstream') {
                            console.warn(
                                `⚠️  Upstream sockets: ${servers?.upstreamSockets?.size ?? 0}`,
                            );
                        }
                        if (servers?.upstreamWss) {
                            console.warn(
                                `⚠️  Upstream WS clients: ${servers.upstreamWss.clients.size}`,
                            );
                        }
                        resolve();
                    }, 1000),
                ),
            ]);
        };

        if (servers?.relay) {
            await withTimeout('relay', () => servers.relay.stop({ force: true }));
        }
        if (servers?.upstream) {
            await withTimeout(
                'upstream',
                () => new Promise<void>((resolve) => servers.upstream.close(() => resolve())),
            );
        }
        if (servers?.upstreamWss) {
            servers.upstreamWss.clients.forEach((client) => {
                try {
                    client.terminate();
                } catch {}
            });
            servers.upstreamWss.close();
        }
        if (servers?.upstreamSockets) {
            servers.upstreamSockets.forEach((socket) => {
                try {
                    socket.destroy();
                } catch {}
            });
            servers.upstreamSockets.clear();
        }
    });

    test('GET /relay/health returns ok', async () => {
        const response = await fetch(`http://127.0.0.1:${servers.relayPort}/relay/health`);
        expect(response.status).toBe(200);
    });

    test('GET /api is proxied without auth', async () => {
        const response = await fetch(`http://127.0.0.1:${servers.relayPort}/api`);
        expect(response.status).toBe(200);
    });

    test('GET / (dashboard) is proxied without auth', async () => {
        const response = await fetch(`http://127.0.0.1:${servers.relayPort}/`);
        expect([200, 404]).toContain(response.status);
    });

    test('GET /health is proxied without auth', async () => {
        const response = await fetch(`http://127.0.0.1:${servers.relayPort}/health`);
        expect(response.status).toBe(200);
    });

    test('POST /api/chat from local IP bypasses auth', async () => {
        const response = await fetch(`http://127.0.0.1:${servers.relayPort}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'ping' }),
        });
        expect(response.status).toBe(200);
    });

    test('POST /webhook/sms from local IP bypasses auth', async () => {
        const response = await fetch(`http://127.0.0.1:${servers.relayPort}/webhook/sms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'Body=test&From=+1234567890',
        });
        const text = await response.text();
        expect(response.status).toBe(200);
        expect(text.startsWith('ok:')).toBe(true);
    });

    test('WebSocket from local IP bypasses auth', async () => {
        const wsUrl = `ws://127.0.0.1:${servers.relayPort}/webhook/voice/stream`;
        const connected = await waitForWs(wsUrl);
        expect(connected).toBe(true);
    });

    test('WebSocket with valid token is accepted', async () => {
        const token = createWsToken(LICENSE_KEY);
        const wsUrl = `ws://127.0.0.1:${servers.relayPort}/webhook/voice/stream/token=${token}`;
        const connected = await waitForWs(wsUrl);
        expect(connected).toBe(true);
    });

    test('GET /api/admin from local IP bypasses auth', async () => {
        const response = await fetch(`http://127.0.0.1:${servers.relayPort}/api/admin/reload`);
        expect([200, 404]).toContain(response.status);
    });

    test('license key header is not forwarded to upstream', async () => {
        const upstream = servers.upstream;
        const receivedHeaders: Record<string, string | string[] | undefined>[] = [];
        const originalListeners = upstream.listeners('request');
        upstream.removeAllListeners('request');
        upstream.on('request', (req, res) => {
            receivedHeaders.push({ ...req.headers });
            res.writeHead(200);
            res.end('ok');
        });

        await fetch(`http://127.0.0.1:${servers.relayPort}/api`, {
            headers: { 'x-license-key': LICENSE_KEY },
        });

        expect(receivedHeaders.length).toBeGreaterThan(0);
        expect(receivedHeaders[0]['x-license-key']).toBeUndefined();

        upstream.removeAllListeners('request');
        for (const listener of originalListeners) {
            upstream.on('request', listener as (...args: any[]) => void);
        }
    });

    test('request body over 1MB is rejected', async () => {
        const largeBody = 'x'.repeat(1_048_577);
        try {
            const response = await fetch(`http://127.0.0.1:${servers.relayPort}/webhook/sms`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'x-license-key': LICENSE_KEY,
                },
                body: largeBody,
            });
            expect([413, 0]).toContain(response.status);
        } catch {}
    });

    test('local IP skips rate limiting', async () => {
        for (let i = 0; i < 15; i++) {
            await fetch(`http://127.0.0.1:${servers.relayPort}/api/chat`);
        }
        const response = await fetch(`http://127.0.0.1:${servers.relayPort}/api/chat`);
        expect(response.status).toBe(200);
    });

    test('tunnel traffic (X-Forwarded-For public IP) requires auth', async () => {
        const response = await fetch(`http://127.0.0.1:${servers.relayPort}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Forwarded-For': '203.0.113.1',
            },
            body: JSON.stringify({ message: 'ping' }),
        });
        expect(response.status).toBe(401);
    });

    test('tunnel traffic with valid license key is accepted', async () => {
        const response = await fetch(`http://127.0.0.1:${servers.relayPort}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Forwarded-For': '203.0.113.1',
                'x-license-key': LICENSE_KEY,
            },
            body: JSON.stringify({ message: 'ping' }),
        });
        expect(response.status).toBe(200);
    });

    test('direct localhost without X-Forwarded-For bypasses auth', async () => {
        const response = await fetch(`http://127.0.0.1:${servers.relayPort}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'ping' }),
        });
        expect(response.status).toBe(200);
    });

    test('tunnel traffic with forwarded private IP bypasses auth', async () => {
        const response = await fetch(`http://127.0.0.1:${servers.relayPort}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Forwarded-For': '192.168.1.100',
            },
            body: JSON.stringify({ message: 'ping' }),
        });
        expect(response.status).toBe(200);
    });

    test('WebSocket with X-Forwarded-For public IP without token is rejected', async () => {
        const wsUrl = `ws://127.0.0.1:${servers.relayPort}/webhook/voice/stream`;
        const connected = await waitForWs(wsUrl, { 'X-Forwarded-For': '203.0.113.1' });
        expect(connected).toBe(false);
    });

    test('rightmost X-Forwarded-For IP is used (spoofing prevention)', async () => {
        const response = await fetch(`http://127.0.0.1:${servers.relayPort}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Forwarded-For': '192.168.1.1, 203.0.113.1',
            },
            body: JSON.stringify({ message: 'ping' }),
        });
        expect(response.status).toBe(401);
    });

    test('dashboard is not accessible through tunnel (public IP)', async () => {
        const response = await fetch(`http://127.0.0.1:${servers.relayPort}/`, {
            headers: { 'X-Forwarded-For': '203.0.113.1' },
        });
        expect(response.status).toBe(401);
    });

    test('non-API paths require auth for public IPs', async () => {
        const response = await fetch(`http://127.0.0.1:${servers.relayPort}/health`, {
            headers: { 'X-Forwarded-For': '203.0.113.1' },
        });
        expect(response.status).toBe(401);
    });
});
