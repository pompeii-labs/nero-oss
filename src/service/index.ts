import express, { Express, Request, Response } from 'express';
import { createServer, Server as HTTPServer } from 'http';
import cors from 'cors';
import { Logger } from '../util/logger.js';
import { Nero } from '../agent/nero.js';
import { NeroConfig } from '../config.js';
import { createHealthRouter } from './routes/health.js';
import { createChatRouter } from './routes/chat.js';
import { handleSms } from '../sms/handler.js';
import { handleIncomingCall } from '../voice/twilio.js';
import { VoiceWebSocketManager } from '../voice/websocket.js';

export class NeroService {
    private app: Express;
    private httpServer: HTTPServer;
    private logger = new Logger('Service');
    private agent: Nero;
    private config: NeroConfig;
    private wsManager: VoiceWebSocketManager | null = null;
    private readonly port: number;
    private readonly host: string;

    constructor(port: number, config: NeroConfig) {
        this.port = port;
        this.host = '0.0.0.0';
        this.config = config;

        this.app = express();
        this.httpServer = createServer(this.app);
        this.agent = new Nero(config);

        this.setupMiddleware();
        this.setupRoutes();
        this.setupShutdown();
    }

    private setupMiddleware(): void {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        this.app.use((req: Request, res: Response, next) => {
            const start = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - start;
                const status = res.statusCode;
                if (req.path !== '/health') {
                    this.logger.debug(`${req.method} ${req.path} ${status} ${duration}ms`);
                }
            });
            next();
        });
    }

    private setupRoutes(): void {
        this.app.get('/', (req: Request, res: Response) => {
            res.json({
                name: 'OpenNero',
                version: '0.1.0',
                status: 'running',
                features: {
                    voice: this.config.voice?.enabled || false,
                    sms: this.config.sms?.enabled || false,
                },
            });
        });

        this.app.use(createHealthRouter(this.agent));
        this.app.use(createChatRouter(this.agent));

        if (this.config.sms?.enabled) {
            this.app.post('/webhook/sms', async (req, res) => {
                await handleSms(req, res, this.config);
            });
            this.logger.info('[SMS] Webhook enabled at /webhook/sms');
        }

        if (this.config.voice?.enabled) {
            this.app.post('/webhook/voice', async (req, res) => {
                await handleIncomingCall(req, res, this.config);
            });
            this.wsManager = new VoiceWebSocketManager(this.httpServer, this.config);
            this.logger.info('[Voice] Webhook enabled at /webhook/voice');
        }
    }

    private setupShutdown(): void {
        const shutdown = async (signal: string) => {
            this.logger.info(`Received ${signal}, shutting down...`);

            if (this.wsManager) {
                await this.wsManager.shutdown();
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
        await this.agent.setup();

        this.httpServer.listen(this.port, this.host, () => {
            this.logger.success(`HTTP server running on http://${this.host}:${this.port}`);

            if (this.config.licenseKey) {
                this.logger.info('[License] Key configured for webhook routing');
                this.startLicensePoll();
            } else {
                this.logger.info('[License] No key - webhooks require manual setup');
            }
        });
    }

    private async startLicensePoll(): Promise<void> {
        const pollInterval = 300000;
        const apiUrl = process.env.POMPEII_API_URL || 'https://api.magmadeploy.com';

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
        setInterval(poll, pollInterval);
    }

    getAgent(): Nero {
        return this.agent;
    }
}
