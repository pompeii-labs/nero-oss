import express, { Express, Request, Response, RequestHandler } from 'express';
import { createServer, Server as HTTPServer } from 'http';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import cors from 'cors';
import semver from 'semver';
import { Logger } from '../util/logger.js';
import { VERSION } from '../util/version.js';
import { Nero } from '../agent/nero.js';
import { NeroConfig } from '../config.js';
import { createHealthRouter } from './routes/health.js';
import { createChatRouter } from './routes/chat.js';
import { createWebRouter } from './routes/web.js';
import { createAdminRouter } from './routes/admin.js';
import { isDbConnected } from '../db/index.js';
import { handleSms } from '../sms/handler.js';
import { handleSlack } from '../slack/handler.js';
import { handlePompeii } from '../pompeii/handler.js';
import { handleIncomingCall } from '../voice/twilio.js';
import { VoiceWebSocketManager } from '../voice/websocket.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createActionsRouter } from './routes/actions.js';
import { createLogsRouter } from './routes/logs.js';
import { RelayServer } from '../relay/index.js';
import { ActionManager } from '../actions/index.js';
import { AutonomyManager } from '../autonomy/index.js';
import { initLogFile } from '../util/logger.js';
import { getNeroHome } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class NeroService {
    private app: Express;
    private httpServer: HTTPServer;
    private logger = new Logger('Service');
    private agent: Nero;
    private config: NeroConfig;
    private wsManager: VoiceWebSocketManager | null = null;
    private licensePollInterval: NodeJS.Timeout | null = null;
    private relay: RelayServer | null = null;
    private actionManager: ActionManager;
    private autonomyManager: AutonomyManager;
    private readonly port: number;
    private readonly host: string;

    constructor(port: number, config: NeroConfig) {
        this.port = port;
        this.host = '127.0.0.1';
        this.config = config;

        this.app = express();
        this.httpServer = createServer(this.app);
        this.agent = new Nero(config);
        this.actionManager = new ActionManager();
        this.autonomyManager = new AutonomyManager(config);

        this.setupMiddleware();
        this.setupRoutes();
        this.setupShutdown();
    }

    private setupMiddleware(): void {
        const backendUrl = process.env.BACKEND_URL || 'https://api.magmadeploy.com';
        const corsOptions = this.config.licenseKey ? { origin: backendUrl } : { origin: true };

        this.app.use(cors(corsOptions));
        this.app.set('trust proxy', false);
        this.app.use(express.json({ limit: '50mb' }));
        this.app.use(express.urlencoded({ extended: true }));

        this.app.use((req: Request, res: Response, next) => {
            const start = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - start;
                const status = res.statusCode;
                const skip =
                    req.path === '/health' ||
                    (req.method === 'GET' &&
                        !req.path.startsWith('/api') &&
                        !req.path.startsWith('/admin') &&
                        !req.path.startsWith('/webhook'));
                if (!skip) {
                    this.logger.debug(`${req.method} ${req.path} ${status} ${duration}ms`);
                }
            });
            next();
        });
    }

    private setupRoutes(): void {
        const authMiddleware = createAuthMiddleware(this.config.licenseKey) as RequestHandler;

        this.setupStaticServing();

        this.app.get('/api', (req: Request, res: Response) => {
            res.json({
                name: 'OpenNero',
                version: VERSION,
                status: 'running',
                features: {
                    voice: this.config.voice?.enabled || false,
                    sms: this.config.sms?.enabled || false,
                    database: isDbConnected(),
                },
            });
        });

        this.app.get('/health', (req: Request, res: Response) => {
            const context = this.agent.getContextUsage();
            res.json({
                status: 'ok',
                agent: {
                    contextUsage: context.percentage,
                    contextTokens: context.tokens,
                },
            });
        });

        this.wsManager = new VoiceWebSocketManager(this.httpServer, this.config, this.agent);
        this.logger.info('[Voice] WebSocket enabled at /webhook/voice/stream');

        if (this.config.voice?.enabled) {
            this.app.post('/webhook/voice', async (req, res) => {
                await handleIncomingCall(req, res, this.config);
            });
            this.logger.info('[Voice] Twilio webhook enabled at /webhook/voice');
        }

        this.app.get('/', (req: Request, res: Response, next) => {
            if (this.isLocalRequest(req)) {
                return next();
            }
            res.json({
                name: 'OpenNero',
                version: VERSION,
                status: 'running',
                webDashboard: 'localhost only',
                features: {
                    voice: this.config.voice?.enabled || false,
                    sms: this.config.sms?.enabled || false,
                },
            });
        });

        this.app.post('/webhook/pompeii', async (req, res) => {
            await handlePompeii(req, res, this.agent, this.config);
        });
        this.logger.info('[Pompeii] Webhook enabled at /webhook/pompeii');

        this.app.use(authMiddleware);

        this.app.use('/api', createHealthRouter(this.agent));
        this.app.use('/api', createChatRouter(this.agent));
        this.app.use('/api', createWebRouter(this.agent, this.port));
        this.app.use('/api', createActionsRouter(this.agent, this.actionManager));
        this.app.use('/api', createLogsRouter());

        this.app.use((req: Request, res: Response, next) => {
            if (req.path.startsWith('/api/admin') && !this.isLocalRequest(req)) {
                res.status(403).json({ error: 'Admin routes are localhost only' });
                return;
            }
            next();
        });
        this.app.use('/api', createAdminRouter());

        if (this.config.sms?.enabled) {
            this.app.post('/webhook/sms', async (req, res) => {
                await handleSms(req, res, this.agent);
            });
            this.logger.info('[SMS] Webhook enabled at /webhook/sms');
        }

        this.app.post('/webhook/slack', async (req, res) => {
            await handleSlack(req, res, this.agent);
        });
        this.logger.info('[Slack] Webhook enabled at /webhook/slack');

        this.setupSpaFallback();
    }

    private webDistPath: string | null = null;

    private isLocalRequest(req: Request): boolean {
        const ip = req.socket.remoteAddress || req.ip || '';
        const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
        return normalized === '127.0.0.1' || normalized === '::1';
    }

    private setupStaticServing(): void {
        const webDistPaths = [
            join(__dirname, '../web/build'),
            join(__dirname, '../../web/build'),
            join(process.cwd(), 'web/build'),
        ];

        for (const path of webDistPaths) {
            if (existsSync(path)) {
                this.webDistPath = path;
                break;
            }
        }

        if (this.webDistPath) {
            this.app.use((req: Request, res: Response, next) => {
                if (this.config.licenseKey && !this.isLocalRequest(req)) {
                    return next();
                }
                express.static(this.webDistPath!)(req, res, next);
            });
            this.logger.info(`[Web] Dashboard served from ${this.webDistPath}`);
            if (this.config.licenseKey) {
                this.logger.info(`[Web] Dashboard restricted to localhost (tunnel mode)`);
            }
        }
    }

    private setupSpaFallback(): void {
        if (this.webDistPath) {
            this.app.get('*', (req: Request, res: Response) => {
                if (!this.isLocalRequest(req)) {
                    res.status(404).json({ error: 'Not found' });
                    return;
                }
                res.sendFile(join(this.webDistPath!, 'index.html'));
            });
        }
    }

    private setupShutdown(): void {
        const shutdown = async (signal: string) => {
            this.logger.info(`Received ${signal}, shutting down...`);

            if (this.licensePollInterval) {
                clearInterval(this.licensePollInterval);
                this.licensePollInterval = null;
            }

            this.actionManager.shutdown();
            this.autonomyManager.shutdown();

            if (this.wsManager) {
                await this.wsManager.shutdown();
            }

            if (this.relay) {
                await this.relay.stop();
                this.relay = null;
            }

            await this.agent.cleanup();

            this.httpServer.close(() => {
                this.logger.info('HTTP server closed');
                process.exit(0);
            });

            setTimeout(() => {
                this.logger.error('Forced shutdown after timeout');
                process.exit(1);
            }, 10000);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }

    async start(): Promise<void> {
        initLogFile(getNeroHome());
        await this.agent.setup();

        this.actionManager.setAgent(this.agent);
        this.actionManager.start();

        this.autonomyManager.setAgent(this.agent);

        const relayPort = this.config.relayPort || 4848;
        this.relay = new RelayServer({
            listenHost: this.config.bindHost || '0.0.0.0',
            listenPort: relayPort,
            targetHost: '127.0.0.1',
            targetPort: this.port,
            licenseKey: this.config.licenseKey || undefined,
        });
        await this.relay.start();

        this.httpServer.listen(this.port, this.host, () => {
            this.logger.success(`Nero v${VERSION} running on http://${this.host}:${this.port}`);

            if (this.config.licenseKey) {
                this.logger.info('[License] Key configured for webhook routing');
                this.startLicensePoll();
            } else {
                this.logger.info('[License] No key - webhooks require manual setup');
            }

            this.checkForUpdates();
        });
    }

    private async checkForUpdates(): Promise<void> {
        try {
            const response = await fetch(
                'https://api.github.com/repos/pompeii-labs/nero-oss/releases/latest',
                {
                    headers: { 'User-Agent': 'Nero' },
                },
            );

            if (!response.ok) return;

            const data = await response.json();
            const latest = data.tag_name?.replace(/^v/, '');

            if (latest && semver.gt(latest, VERSION)) {
                this.logger.warn(
                    `[Update] New version available: v${latest} (current: v${VERSION})`,
                );
                this.logger.warn(`[Update] Run 'nero update' to upgrade`);
            }
        } catch {}
    }

    private async startLicensePoll(): Promise<void> {
        const pollInterval = 300000;
        const apiUrl = process.env.BACKEND_URL || 'https://api.magmadeploy.com';

        const poll = async () => {
            try {
                const response = await fetch(`${apiUrl}/v1/license/ping`, {
                    method: 'POST',
                    headers: {
                        'x-license-key': this.config.licenseKey!,
                    },
                });

                if (!response.ok) {
                    this.logger.warn(`[License] Poll failed: ${response.status}`);
                }
            } catch (error) {
                const err = error as Error;
                this.logger.debug(`[License] Poll error: ${err.message}`);
            }
        };

        await poll();
        this.licensePollInterval = setInterval(poll, pollInterval);
    }

    getAgent(): Nero {
        return this.agent;
    }
}
