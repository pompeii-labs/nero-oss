import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer, IncomingMessage } from 'http';
import chalk from 'chalk';
import {
    DeepgramModel,
    DeepgramSTT,
    ElevenLabsTTS,
    MagmaFlow,
    MagmaFlowSTTOutput,
} from '@pompeii-labs/audio/voice';
import { Nero } from '../agent/nero.js';
import { NeroConfig } from '../config.js';
import { Logger } from '../util/logger.js';
import { verifyWsToken } from '../util/wstoken.js';

const logger = new Logger('Voice');

interface Connection {
    id: string;
    ws: WebSocket;
    flow?: MagmaFlow;
    active: boolean;
    streamSid?: string;
}

export class VoiceWebSocketManager {
    private wss: WebSocketServer;
    private connections: Map<string, Connection> = new Map();
    private config: NeroConfig;
    private agent: Nero;
    private readonly MAX_CONNECTIONS = 100;
    private readonly HEARTBEAT_INTERVAL = 30_000;
    private heartbeatTimer?: NodeJS.Timeout;

    constructor(server: HttpServer, config: NeroConfig, agent: Nero) {
        this.config = config;
        this.agent = agent;
        this.wss = new WebSocketServer({ noServer: true });

        server.on('upgrade', (request, socket, head) => {
            const url = new URL(request.url!, `http://${request.headers.host}`);
            const pathname = url.pathname;

            if (pathname.startsWith('/webhook/voice/stream')) {
                if (this.config.licenseKey) {
                    const tokenMatch = pathname.match(/\/token=([^/]+)/);
                    const token = tokenMatch ? tokenMatch[1] : null;
                    if (!token || !verifyWsToken(token, this.config.licenseKey)) {
                        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                        socket.destroy();
                        return;
                    }
                }

                this.wss.handleUpgrade(request, socket, head, (ws) => {
                    this.wss.emit('connection', ws, request);
                });
            } else {
                socket.destroy();
            }
        });

        this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
        this.wss.on('error', (error) => console.error(chalk.red(`[ws] Error: ${error.message}`)));

        this.startHeartbeat();
    }

    private startHeartbeat(): void {
        this.heartbeatTimer = setInterval(() => {
            this.connections.forEach((conn, id) => {
                if (!conn.active) {
                    console.log(chalk.dim(`[ws] Terminating inactive: ${id}`));
                    conn.ws.terminate();
                    this.connections.delete(id);
                    return;
                }
                conn.active = false;
                conn.ws.ping();
            });
        }, this.HEARTBEAT_INTERVAL);
    }

    private async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
        if (this.connections.size >= this.MAX_CONNECTIONS) {
            ws.close(1008, 'Server is overloaded');
            return;
        }

        const connectionId = crypto.randomUUID();
        let streamSid: string | undefined;
        let flow: MagmaFlow | undefined;
        let currentBuffer = '';

        const setupFlow = () => {
            const voiceId = this.config.voice?.elevenlabsVoiceId || 'cjVigY5qzO86Huf0OWal';

            const tts = new ElevenLabsTTS({
                model: 'eleven_flash_v2_5',
                voice: voiceId,
                config: {
                    voice_settings: {
                        use_speaker_boost: true,
                        similarity_boost: 0.75,
                        stability: 0.75,
                    },
                },
            });

            const stt = new DeepgramSTT({
                model: DeepgramModel.NOVA_3,
            });

            flow = new MagmaFlow({
                stt,
                tts,
                config: {
                    pauseDurationMs: 250,
                    sentenceChunkLength: 30,
                },
                inputFormat: {
                    encoding: 'mulaw',
                    sampleRate: 8000,
                    channels: 1,
                },
                outputFormat: {
                    encoding: 'mulaw',
                    sampleRate: 8000,
                    channels: 1,
                },
                onSpeechDetected: () => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ event: 'clear', streamSid }));
                    }
                    flow?.interruptTTS();
                },
                onTranscription: async (output: MagmaFlowSTTOutput) => {
                    if (!output.text) return;

                    console.log(chalk.cyan(`[voice] User transcription received`));

                    flow?.interruptTTS();
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ event: 'clear', streamSid }));
                    }

                    currentBuffer = output.text;
                    this.agent.setMedium('voice');

                    let toolMessageSent = false;
                    this.agent.setActivityCallback((activity) => {
                        logger.tool(activity);
                        if (activity.status === 'running' && !toolMessageSent) {
                            toolMessageSent = true;
                            flow?.inputText("Hold on, let me check that.");
                            flow?.inputText(null as unknown as string);
                        }
                    });

                    const response = await this.agent.chat(currentBuffer, (chunk) => {
                        flow?.inputText(chunk);
                    });
                    flow?.inputText(null as unknown as string);

                    this.agent.setActivityCallback(undefined);

                    console.log(chalk.magenta(`[voice] Response sent`));
                },
                onAudioOutput: (buffer: Buffer) => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            event: 'media',
                            streamSid,
                            media: { payload: buffer.toString('base64') },
                        }));
                    }
                },
            });

            const conn = this.connections.get(connectionId);
            if (conn) conn.flow = flow;

            console.log(chalk.dim('[voice] MagmaFlow setup complete'));
        };

        ws.on('message', async (data) => {
            try {
                const parsed = JSON.parse(data.toString());
                const event = parsed.event as string;

                switch (event) {
                    case 'start':
                        streamSid = parsed.start?.streamSid;
                        console.log(chalk.dim(`[voice] Stream started: ${streamSid}`));
                        break;

                    case 'media': {
                        const payload = Buffer.from(parsed.media.payload, 'base64');
                        flow?.inputAudio(payload);
                        break;
                    }

                    case 'stop':
                        flow?.kill();
                        break;

                    case 'connected':
                        if (!flow) setupFlow();

                        flow?.inputText("Hey, this is Nero. What's on your mind?");
                        flow?.inputText(null as unknown as string);
                        break;

                    default:
                        if (event) console.log(chalk.dim(`[voice] Unknown event: ${event}`));
                }
            } catch (error) {
                const err = error as Error;
                console.error(chalk.red(`[voice] Parse error: ${err.message}`));
            }
        });

        ws.on('close', async (code, reason) => {
            console.log(chalk.dim(`[voice] Connection closed: ${connectionId} (${code})`));
            const conn = this.connections.get(connectionId);
            if (conn) {
                conn.flow?.kill();
            }
            this.connections.delete(connectionId);
        });

        ws.on('pong', () => {
            const conn = this.connections.get(connectionId);
            if (conn) conn.active = true;
        });

        ws.on('error', (error) => {
            console.error(chalk.red(`[voice] WS error: ${error.message}`));
        });

        this.connections.set(connectionId, {
            id: connectionId,
            ws,
            flow,
            active: true,
            streamSid,
        });

        console.log(chalk.dim(`[voice] Connection established: ${connectionId}`));
    }

    async shutdown(): Promise<void> {
        console.log(chalk.dim('[ws] Shutting down...'));

        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }

        for (const [id, conn] of this.connections) {
            try {
                conn.flow?.kill();
                conn.ws.close(1001, 'Server shutting down');
            } catch (error) {
                const err = error as Error;
                console.error(chalk.red(`[ws] Error closing ${id}: ${err.message}`));
            }
        }

        this.connections.clear();

        await new Promise<void>((resolve, reject) => {
            this.wss.close((error) => {
                if (error) reject(error);
                else resolve();
            });
        });

        console.log(chalk.dim('[ws] Shutdown complete'));
    }
}
