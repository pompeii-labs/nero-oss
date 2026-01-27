import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import chalk from 'chalk';
import { NeroConfig } from '../config.js';
import { handleSms } from '../sms/handler.js';
import { handleIncomingCall } from '../voice/twilio.js';
import { VoiceWebSocketManager } from '../voice/websocket.js';

export async function startServer(port: number, config: NeroConfig): Promise<void> {
    const app = express();
    const server = createServer(app);

    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const duration = Date.now() - start;
            const status = res.statusCode;
            const color = status >= 400 ? chalk.red : chalk.green;
            console.log(
                chalk.dim(`${req.method} ${req.path}`) +
                color(` ${status}`) +
                chalk.dim(` ${duration}ms`)
            );
        });
        next();
    });

    app.get('/', (req, res) => {
        res.json({
            name: 'OpenNero',
            version: '0.1.0',
            status: 'running',
            features: {
                voice: config.voice?.enabled || false,
                sms: config.sms?.enabled || false,
            },
        });
    });

    app.get('/health', (req, res) => {
        res.json({ status: 'ok' });
    });

    if (config.sms?.enabled) {
        app.post('/webhook/sms', async (req, res) => {
            await handleSms(req, res, config);
        });
        console.log(chalk.dim('[server] SMS webhook enabled at /webhook/sms'));
    }

    let wsManager: VoiceWebSocketManager | null = null;

    if (config.voice?.enabled) {
        app.post('/webhook/voice', async (req, res) => {
            await handleIncomingCall(req, res, config);
        });

        wsManager = new VoiceWebSocketManager(server, config);

        console.log(chalk.dim('[server] Voice webhooks enabled at /webhook/voice'));
    }

    const gracefulShutdown = async (signal: string) => {
        console.log(chalk.dim(`\n[server] ${signal} received, shutting down...`));

        if (wsManager) {
            await wsManager.shutdown();
        }

        server.close(() => {
            console.log(chalk.dim('[server] HTTP server closed'));
            process.exit(0);
        });

        setTimeout(() => {
            console.log(chalk.yellow('[server] Forcing shutdown after timeout'));
            process.exit(1);
        }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    server.listen(port, () => {
        console.log(chalk.bold.blue(`\n  Nero server running on port ${port}\n`));

        if (config.licenseKey) {
            console.log(chalk.dim('  License key configured for webhook routing'));
            startLicensePoll(config.licenseKey, port);
        } else {
            console.log(chalk.yellow('  No license key - webhooks require manual setup'));
        }

        console.log();
    });
}

async function startLicensePoll(licenseKey: string, port: number): Promise<void> {
    const pollInterval = 60000;

    const poll = async () => {
        try {
            const response = await fetch('https://api.pompeiilabs.com/nero/ping', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${licenseKey}`,
                },
                body: JSON.stringify({ port }),
            });

            if (!response.ok) {
                console.log(chalk.yellow(`[license] Poll failed: ${response.status}`));
            }
        } catch (error) {
            const err = error as Error;
            console.log(chalk.dim(`[license] Poll error: ${err.message}`));
        }
    };

    await poll();
    setInterval(poll, pollInterval);
}
