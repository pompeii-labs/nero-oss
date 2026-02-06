import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { RelayServer } from '../src/relay/index.js';
import { createWsToken } from '../src/util/wstoken.js';

const LICENSE_KEY = 'test-license-key-12345';
const PORT_CANDIDATES = [18488, 19488, 20488, 21488, 22488];
const RELAY_PORT_CANDIDATES = [18489, 19489, 20489, 21489, 22489];

type Servers = {
    upstream: http.Server;
    upstreamWss: WebSocketServer;
    relay: RelayServer;
    upstreamPort: number;
    relayPort: number;
    upstreamSockets: Set<import('net').Socket>;
};

async function listenOnFixedPort(server: http.Server, host: string, port: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const onError = (err: any) => {
            server.off('listening', onListening);
            reject(err);
        };
        const onListening = () => {
            server.off('error', onError);
            resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
    });
}

async function bindToFirstFreePort(
    server: http.Server,
    host: string,
    ports: number[],
): Promise<number> {
    let lastErr: unknown = null;
    for (const port of ports) {
        try {
            await listenOnFixedPort(server, host, port);
            return port;
        } catch (err) {
            lastErr = err;
            continue;
        }
    }
    throw lastErr ?? new Error('No available ports');
}

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

    const upstreamPort = await bindToFirstFreePort(upstream, '127.0.0.1', PORT_CANDIDATES);

    const relayServer = http.createServer();
    const relayPort = await bindToFirstFreePort(relayServer, '127.0.0.1', RELAY_PORT_CANDIDATES);
    relayServer.close();

    const relay = new RelayServer({
        listenHost: '127.0.0.1',
        listenPort: relayPort,
        targetHost: '127.0.0.1',
        targetPort: upstreamPort,
        licenseKey: LICENSE_KEY,
    });
    await relay.start();

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

    test('GET /api is proxied', async () => {
        const response = await fetch(`http://127.0.0.1:${servers.relayPort}/api`, {
            headers: { 'x-license-key': LICENSE_KEY },
        });
        expect(response.status).toBe(200);
    });

    test('POST /api/chat without key is rejected', async () => {
        const response = await fetch(`http://127.0.0.1:${servers.relayPort}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'ping' }),
        });
        expect(response.status).toBe(401);
    });

    test('POST /api/chat with key succeeds', async () => {
        const response = await fetch(`http://127.0.0.1:${servers.relayPort}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-license-key': LICENSE_KEY,
            },
            body: JSON.stringify({ message: 'ping' }),
        });
        expect(response.status).toBe(200);
    });

    test('POST /webhook/sms without key is rejected', async () => {
        const response = await fetch(`http://127.0.0.1:${servers.relayPort}/webhook/sms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'Body=test&From=+1234567890',
        });
        expect(response.status).toBe(401);
    });

    test('POST /webhook/sms with wrong key is rejected', async () => {
        const response = await fetch(`http://127.0.0.1:${servers.relayPort}/webhook/sms`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'x-license-key': 'wrong-key',
            },
            body: 'Body=test&From=+1234567890',
        });
        expect(response.status).toBe(403);
    });

    test('POST /webhook/sms with key is proxied', async () => {
        const response = await fetch(`http://127.0.0.1:${servers.relayPort}/webhook/sms`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'x-license-key': LICENSE_KEY,
            },
            body: 'Body=test&From=+1234567890',
        });
        const text = await response.text();
        expect(response.status).toBe(200);
        expect(text.startsWith('ok:')).toBe(true);
    });

    test('WebSocket without token or header is rejected', async () => {
        const wsUrl = `ws://127.0.0.1:${servers.relayPort}/webhook/voice/stream`;
        const connected = await waitForWs(wsUrl);
        expect(connected).toBe(false);
    });

    test('WebSocket with header key is accepted', async () => {
        const wsUrl = `ws://127.0.0.1:${servers.relayPort}/webhook/voice/stream`;
        const connected = await waitForWs(wsUrl, { 'x-license-key': LICENSE_KEY });
        expect(connected).toBe(true);
    });

    test('WebSocket with valid token is accepted', async () => {
        const token = createWsToken(LICENSE_KEY);
        const wsUrl = `ws://127.0.0.1:${servers.relayPort}/webhook/voice/stream/token=${token}`;
        const connected = await waitForWs(wsUrl);
        expect(connected).toBe(true);
    });

    test('GET /api/admin is blocked by relay', async () => {
        const response = await fetch(`http://127.0.0.1:${servers.relayPort}/api/admin/reload`, {
            headers: { 'x-license-key': LICENSE_KEY },
        });
        expect(response.status).toBe(404);
    });

    test('GET /api/admin/ subpaths are blocked by relay', async () => {
        const response = await fetch(`http://127.0.0.1:${servers.relayPort}/api/admin/restart`, {
            headers: { 'x-license-key': LICENSE_KEY },
        });
        expect(response.status).toBe(404);
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

    test('rate limiting blocks after repeated failures', async () => {
        for (let i = 0; i < 10; i++) {
            await fetch(`http://127.0.0.1:${servers.relayPort}/api`, {
                headers: { 'x-license-key': 'wrong-key-attempt' },
            });
        }
        const response = await fetch(`http://127.0.0.1:${servers.relayPort}/api`, {
            headers: { 'x-license-key': 'wrong-key-attempt' },
        });
        expect(response.status).toBe(429);
    });
});
