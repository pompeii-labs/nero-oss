import http, { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';
import { Logger } from '../util/logger.js';
import { verifyWsToken } from '../util/wstoken.js';
import { Socket } from 'net';

const MAX_BODY_BYTES = 52_428_800;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_FAILURES = 10;
const RATE_CLEANUP_INTERVAL_MS = 300_000;

interface RelayConfig {
    listenHost: string;
    listenPort: number;
    targetHost: string;
    targetPort: number;
    licenseKey?: string;
}

interface RateLimitEntry {
    failures: number;
    windowStart: number;
}

export class RelayServer {
    private server: http.Server;
    private wss: WebSocketServer;
    private logger = new Logger('Relay');
    private config: RelayConfig;
    private clientSockets: Set<WebSocket> = new Set();
    private upstreamSockets: Set<WebSocket> = new Set();
    private httpSockets: Set<Socket> = new Set();
    private rateLimitMap: Map<string, RateLimitEntry> = new Map();
    private rateLimitCleanup: NodeJS.Timeout | null = null;
    private stopped = false;

    get port(): number {
        const addr = this.server.address();
        if (addr && typeof addr === 'object') return addr.port;
        return this.config.listenPort;
    }

    constructor(config: RelayConfig) {
        this.config = config;
        this.server = http.createServer(this.handleHttp.bind(this));
        this.server.keepAliveTimeout = 5_000;
        this.server.headersTimeout = 10_000;
        this.server.on('connection', (socket) => {
            this.httpSockets.add(socket);
            socket.on('close', () => this.httpSockets.delete(socket));
        });
        this.wss = new WebSocketServer({ noServer: true });

        this.server.on('upgrade', (req, socket, head) => {
            const url = new URL(req.url || '/', `http://${req.headers.host}`);
            if (!url.pathname.startsWith('/webhook/voice/stream')) {
                socket.destroy();
                return;
            }

            if (this.config.licenseKey) {
                const ip = this.getClientIp(req);

                if (!this.isPrivateIp(ip)) {
                    if (this.isRateLimited(ip)) {
                        socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
                        socket.destroy();
                        return;
                    }

                    const tokenMatch = url.pathname.match(/\/token=([^/]+)/);
                    const token = tokenMatch ? tokenMatch[1] : null;
                    const headerKey = (req.headers['x-license-key'] as string) || '';
                    const tokenValid = token ? verifyWsToken(token, this.config.licenseKey) : false;
                    const headerValid = headerKey.length > 0 && this.verifyLicenseKey(headerKey);

                    if (!tokenValid && !headerValid) {
                        this.recordFailure(ip);
                        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                        socket.destroy();
                        return;
                    }
                }
            }

            this.wss.handleUpgrade(req, socket, head, (ws) => {
                this.wss.emit('connection', ws, req);
            });
        });

        this.wss.on('connection', (ws, req) => this.proxyWebSocket(ws, req));
    }

    async start(): Promise<void> {
        this.rateLimitCleanup = setInterval(() => {
            const now = Date.now();
            for (const [ip, entry] of this.rateLimitMap) {
                if (now - entry.windowStart > RATE_WINDOW_MS) this.rateLimitMap.delete(ip);
            }
        }, RATE_CLEANUP_INTERVAL_MS);

        return new Promise((resolve, reject) => {
            this.server.on('error', (err: NodeJS.ErrnoException) => {
                if (this.rateLimitCleanup) {
                    clearInterval(this.rateLimitCleanup);
                    this.rateLimitCleanup = null;
                }
                if (err.code === 'EADDRINUSE') {
                    reject(new Error(`Port ${this.config.listenPort} is already in use`));
                } else {
                    reject(err);
                }
            });
            this.server.listen(this.config.listenPort, this.config.listenHost, () => {
                this.logger.info(
                    `[Relay] Listening on http://${this.config.listenHost}:${this.port}`,
                );
                resolve();
            });
        });
    }

    async stop(options: { force?: boolean } = {}): Promise<void> {
        return new Promise((resolve, reject) => {
            this.stopped = true;
            if (this.rateLimitCleanup) {
                clearInterval(this.rateLimitCleanup);
                this.rateLimitCleanup = null;
            }
            for (const client of this.wss.clients) {
                try {
                    client.terminate();
                } catch {}
            }
            for (const client of this.clientSockets) {
                try {
                    client.terminate();
                } catch {}
            }
            for (const upstream of this.upstreamSockets) {
                try {
                    upstream.terminate();
                } catch {}
            }
            this.clientSockets.clear();
            this.upstreamSockets.clear();
            this.wss.close();
            for (const socket of this.httpSockets) {
                try {
                    socket.destroy();
                } catch {}
            }
            this.httpSockets.clear();
            let resolved = false;
            const finish = (err?: Error | null) => {
                if (resolved) return;
                resolved = true;
                if (err) reject(err);
                else resolve();
            };
            this.server.once('close', () => finish());
            this.server.close((err) => {
                if (err) finish(err);
            });
            if (options.force) {
                resolve();
            }
        });
    }

    private getClientIp(req: IncomingMessage): string {
        const raw = req.socket.remoteAddress || '';
        return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
    }

    private isPrivateIp(ip: string): boolean {
        if (ip === '127.0.0.1' || ip === '::1') return true;
        const parts = ip.split('.').map(Number);
        if (parts.length !== 4) return false;
        if (parts[0] === 10) return true;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
        if (parts[0] === 192 && parts[1] === 168) return true;
        return false;
    }

    private isRateLimited(ip: string): boolean {
        const entry = this.rateLimitMap.get(ip);
        if (!entry) return false;
        if (Date.now() - entry.windowStart > RATE_WINDOW_MS) {
            this.rateLimitMap.delete(ip);
            return false;
        }
        return entry.failures >= RATE_MAX_FAILURES;
    }

    private recordFailure(ip: string): void {
        const now = Date.now();
        const entry = this.rateLimitMap.get(ip);
        if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
            this.rateLimitMap.set(ip, { failures: 1, windowStart: now });
        } else {
            entry.failures++;
        }
    }

    private verifyLicenseKey(provided: string): boolean {
        const expected = this.config.licenseKey!;
        if (provided.length !== expected.length) return false;
        return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    }

    private handleHttp(req: IncomingMessage, res: ServerResponse): void {
        res.setHeader('Connection', 'close');
        const url = new URL(req.url || '/', `http://${req.headers.host}`);

        if (req.method === 'GET' && url.pathname === '/relay/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
            return;
        }

        if (this.config.licenseKey) {
            const ip = this.getClientIp(req);
            const needsAuth =
                !this.isPrivateIp(ip) &&
                (url.pathname.startsWith('/api/') ||
                    url.pathname.startsWith('/admin') ||
                    (req.method === 'POST' && url.pathname.startsWith('/webhook/')));

            if (needsAuth) {
                if (this.isRateLimited(ip)) {
                    res.writeHead(429, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Too many requests' }));
                    return;
                }

                const provided = (req.headers['x-license-key'] as string) || '';
                if (!provided) {
                    this.recordFailure(ip);
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'License key required' }));
                    return;
                }
                if (!this.verifyLicenseKey(provided)) {
                    this.recordFailure(ip);
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid license key' }));
                    return;
                }
            }
        }

        this.proxyRequest(req, res);
    }

    private proxyRequest(req: IncomingMessage, res: ServerResponse): void {
        const { 'x-license-key': _, ...forwardHeaders } = req.headers;
        forwardHeaders.host = `${this.config.targetHost}:${this.config.targetPort}`;

        const upstream = http.request(
            {
                protocol: 'http:',
                hostname: this.config.targetHost,
                port: this.config.targetPort,
                method: req.method,
                path: req.url,
                headers: forwardHeaders,
            },
            (upstreamRes) => {
                res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
                upstreamRes.pipe(res);
            },
        );

        upstream.on('error', (err) => {
            this.logger.error(`[Relay] Upstream error: ${err.message}`);
            if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
            }
            res.end(JSON.stringify({ error: 'Upstream error' }));
        });

        let received = 0;
        req.on('data', (chunk: Buffer) => {
            received += chunk.length;
            if (received > MAX_BODY_BYTES) {
                req.destroy();
                upstream.destroy();
                if (!res.headersSent) {
                    res.writeHead(413, { 'Content-Type': 'application/json' });
                }
                res.end(JSON.stringify({ error: 'Request body too large' }));
            }
        });

        req.pipe(upstream);
    }

    private proxyWebSocket(clientWs: WebSocket, req: IncomingMessage): void {
        const targetUrl = `ws://${this.config.targetHost}:${this.config.targetPort}${req.url || ''}`;
        const upstreamWs = new WebSocket(targetUrl);
        this.clientSockets.add(clientWs);
        this.upstreamSockets.add(upstreamWs);

        const closeBoth = (code?: number, reason?: Buffer) => {
            try {
                if (clientWs.readyState === WebSocket.OPEN)
                    clientWs.close(code, reason?.toString());
            } catch {}
            try {
                if (upstreamWs.readyState === WebSocket.OPEN)
                    upstreamWs.close(code, reason?.toString());
            } catch {}
        };

        clientWs.on('message', (data, isBinary) => {
            if (upstreamWs.readyState === WebSocket.OPEN)
                upstreamWs.send(data, { binary: isBinary });
        });

        upstreamWs.on('message', (data, isBinary) => {
            if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data, { binary: isBinary });
        });

        clientWs.on('close', (code, reason) => {
            this.clientSockets.delete(clientWs);
            closeBoth(code, reason as Buffer);
        });
        clientWs.on('error', () => {
            this.clientSockets.delete(clientWs);
            closeBoth();
        });
        upstreamWs.on('close', (code, reason) => {
            this.upstreamSockets.delete(upstreamWs);
            closeBoth(code, reason);
        });
        upstreamWs.on('error', () => {
            this.upstreamSockets.delete(upstreamWs);
            closeBoth();
        });
    }
}
