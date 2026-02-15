import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer, IncomingMessage } from 'http';
import chalk from 'chalk';
import {
    DeepgramModel,
    DeepgramSTT,
    DeepgramFluxSTT,
    ElevenLabsTTS,
    HumeTTS,
    MagmaFlow,
    MagmaFlowSpeechToText,
    MagmaFlowSTTOutput,
} from '@pompeii-labs/audio/voice';
import { Nero } from '../agent/nero.js';
import { NeroConfig } from '../config.js';
import { HumeEmotionDetector } from './emotion.js';
import { Logger } from '../util/logger.js';
import { verifyWsToken } from '../util/wstoken.js';

const logger = new Logger('Voice');

function shouldEnableEmotion(config: NeroConfig): boolean {
    return !!config.voice.emotionDetection && !!process.env.HUME_API_KEY;
}

interface Connection {
    id: string;
    ws: WebSocket;
    flow?: MagmaFlow;
    active: boolean;
}

function createSTT(config: NeroConfig): MagmaFlowSpeechToText {
    if (config.voice.sttModel === 'flux') {
        return new DeepgramFluxSTT({
            eotThreshold: config.voice.flux.eotThreshold,
            eagerEotThreshold: config.voice.flux.eagerEotThreshold,
            eotTimeoutMs: config.voice.flux.eotTimeoutMs,
        });
    }
    return new DeepgramSTT({ model: DeepgramModel.NOVA_3 });
}

function createTTS(config: NeroConfig) {
    if (config.voice.ttsProvider === 'hume') {
        const humeConfig = config.voice.hume;
        return new HumeTTS({
            voice: humeConfig.voice
                ? { name: humeConfig.voice, provider: humeConfig.voiceProvider }
                : undefined,
            description: humeConfig.description,
            speed: humeConfig.speed,
            version: humeConfig.version,
        });
    }
    const el = config.voice.elevenlabs;
    const voiceId = el.voiceId || config.voice.elevenlabsVoiceId || 'cjVigY5qzO86Huf0OWal';
    return new ElevenLabsTTS({
        model: el.model,
        voice: voiceId,
        config: {
            voice_settings: {
                use_speaker_boost: false,
                similarity_boost: el.similarityBoost,
                stability: el.stability,
                speed: el.speed,
            },
        },
    });
}

export class VoiceWebSocketManager {
    private twilioWss: WebSocketServer;
    private webWss: WebSocketServer;
    private connections: Map<string, Connection> = new Map();
    private config: NeroConfig;
    private agent: Nero;
    private readonly MAX_CONNECTIONS = 100;
    private readonly HEARTBEAT_INTERVAL = 30_000;
    private heartbeatTimer?: NodeJS.Timeout;

    constructor(server: HttpServer, config: NeroConfig, agent: Nero) {
        this.config = config;
        this.agent = agent;

        this.twilioWss = new WebSocketServer({ noServer: true });
        this.webWss = new WebSocketServer({ noServer: true });

        console.log(chalk.dim(`[voice] VoiceWebSocketManager initialized`));

        server.on('upgrade', (request, socket, head) => {
            const url = new URL(request.url!, `http://${request.headers.host}`);
            const pathname = url.pathname;

            console.log(chalk.dim(`[voice] WebSocket upgrade: ${pathname}`));

            const isLocal = (() => {
                const ip = request.socket.remoteAddress || '';
                const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
                return normalized === '127.0.0.1' || normalized === '::1';
            })();

            if (pathname.startsWith('/webhook/voice/stream/token=')) {
                const tokenMatch = pathname.match(/\/token=([^/]+)/);
                const token = tokenMatch ? tokenMatch[1] : null;

                if (
                    this.config.licenseKey &&
                    (!token || !verifyWsToken(token, this.config.licenseKey))
                ) {
                    console.log(chalk.red(`[voice] Twilio auth failed`));
                    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                    socket.destroy();
                    return;
                }

                console.log(chalk.green(`[voice] Twilio connection accepted`));
                this.twilioWss.handleUpgrade(request, socket, head, (ws) => {
                    this.twilioWss.emit('connection', ws, request);
                });
            } else if (pathname === '/webhook/voice/stream') {
                if (this.config.licenseKey && !isLocal) {
                    const headerKey = request.headers['x-license-key'] as string;
                    if (!headerKey || !verifyWsToken(headerKey, this.config.licenseKey)) {
                        console.log(chalk.red(`[voice] Web voice auth failed`));
                        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                        socket.destroy();
                        return;
                    }
                }

                console.log(chalk.green(`[voice] Web voice connection accepted`));
                this.webWss.handleUpgrade(request, socket, head, (ws) => {
                    this.webWss.emit('connection', ws, request);
                });
            } else {
                console.log(chalk.yellow(`[voice] Unknown path: ${pathname}`));
                socket.destroy();
            }
        });

        this.twilioWss.on('connection', (ws, req) => this.handleTwilio(ws, req));
        this.twilioWss.on('error', (err) => console.error(chalk.red(`[twilio-ws] ${err.message}`)));

        this.webWss.on('connection', (ws, req) => this.handleWebVoice(ws, req));
        this.webWss.on('error', (err) => console.error(chalk.red(`[web-ws] ${err.message}`)));

        this.startHeartbeat();
    }

    private startHeartbeat(): void {
        this.heartbeatTimer = setInterval(() => {
            this.connections.forEach((conn, id) => {
                if (!conn.active) {
                    console.log(chalk.dim(`[voice] Terminating inactive: ${id}`));
                    conn.ws.terminate();
                    this.connections.delete(id);
                    return;
                }
                conn.active = false;
                conn.ws.ping();
            });
        }, this.HEARTBEAT_INTERVAL);
    }

    private async handleTwilio(ws: WebSocket, req: IncomingMessage): Promise<void> {
        if (this.connections.size >= this.MAX_CONNECTIONS) {
            return ws.close(1008, 'Server is overloaded');
        }

        const connectionId = crypto.randomUUID();
        let streamSid: string | undefined;
        let flow: MagmaFlow | undefined;
        let emotionDetector: HumeEmotionDetector | undefined;

        console.log(chalk.dim(`[twilio] Connection established: ${connectionId}`));

        const setupFlow = () => {
            const stt = createSTT(this.config);
            const tts = createTTS(this.config);

            if (shouldEnableEmotion(this.config)) {
                emotionDetector = new HumeEmotionDetector();
                emotionDetector.connect();
            }

            if (stt instanceof DeepgramFluxSTT) {
                stt.onTurnResumed = () => flow?.interruptTTS();
                stt.onEagerEndOfTurn = (transcript: string) => {
                    console.log(chalk.dim(`[twilio] Eager EOT: "${transcript}"`));
                };
            }

            flow = new MagmaFlow({
                stt,
                tts,
                config: { pauseDurationMs: 250, sentenceChunkLength: 50 },
                inputFormat: { encoding: 'mulaw', sampleRate: 8000, channels: 1 },
                outputFormat: { encoding: 'mulaw', sampleRate: 8000, channels: 1 },
                onNormalizedAudio: emotionDetector
                    ? (audio: Buffer) => emotionDetector!.input(audio)
                    : undefined,
                onSpeechDetected: () => {
                    emotionDetector?.unmute();
                    flow?.interruptTTS();
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ event: 'clear', streamSid }));
                    }
                },
                onTranscription: async (output: MagmaFlowSTTOutput) => {
                    if (!output.text) return;
                    console.log(chalk.cyan(`[twilio] Transcription received`));

                    flow?.interruptTTS();
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ event: 'clear', streamSid }));
                    }

                    this.agent.setMedium('voice');

                    let toolMessageSent = false;
                    this.agent.setActivityCallback((activity) => {
                        logger.tool(activity);
                        if (activity.status === 'running' && !toolMessageSent) {
                            toolMessageSent = true;
                            flow?.inputText('Hold on, let me check that.');
                            flow?.inputText(null as unknown as string);
                        }
                    });

                    let messageText = output.text;
                    const emotionTag = emotionDetector?.formatForLLM();
                    if (emotionTag) {
                        messageText = `${emotionTag}\n${output.text}`;
                    }

                    emotionDetector?.mute();
                    await this.agent.chat(messageText, (chunk) => flow?.inputText(chunk));
                    flow?.inputText(null as unknown as string);
                    this.agent.setActivityCallback(undefined);
                },
                onAudioOutput: (buffer: Buffer) => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(
                            JSON.stringify({
                                event: 'media',
                                streamSid,
                                media: { payload: buffer.toString('base64') },
                            }),
                        );
                    }
                },
            });

            const conn = this.connections.get(connectionId);
            if (conn) conn.flow = flow;
        };

        ws.on('message', async (data) => {
            try {
                const parsed = JSON.parse(data.toString());

                switch (parsed.event) {
                    case 'start':
                        streamSid = parsed.start?.streamSid;
                        console.log(chalk.dim(`[twilio] Stream started: ${streamSid}`));

                        this.agent.setMedium('voice');
                        this.agent
                            .chat('<start />', (chunk) => flow?.inputText(chunk))
                            .then(() => {
                                flow?.inputText(null as unknown as string);
                            });
                        break;
                    case 'media':
                        flow?.inputAudio(Buffer.from(parsed.media.payload, 'base64'));
                        break;
                    case 'stop':
                        flow?.kill();
                        break;
                    case 'connected':
                        if (!flow) setupFlow();
                        break;
                }
            } catch (err) {
                console.error(chalk.red(`[twilio] Parse error: ${(err as Error).message}`));
            }
        });

        ws.on('close', () => {
            console.log(chalk.dim(`[twilio] Connection closed: ${connectionId}`));
            emotionDetector?.kill();
            this.connections.get(connectionId)?.flow?.kill();
            this.connections.delete(connectionId);
        });

        ws.on('pong', () => {
            const conn = this.connections.get(connectionId);
            if (conn) conn.active = true;
        });

        ws.on('error', (err) => console.error(chalk.red(`[twilio] Error: ${err.message}`)));

        this.connections.set(connectionId, { id: connectionId, ws, flow, active: true });
    }

    private async handleWebVoice(ws: WebSocket, req: IncomingMessage): Promise<void> {
        if (this.connections.size >= this.MAX_CONNECTIONS) {
            return ws.close(1008, 'Server is overloaded');
        }

        const connectionId = crypto.randomUUID();
        let flow: MagmaFlow | undefined;
        let emotionDetector: HumeEmotionDetector | undefined;

        console.log(chalk.dim(`[web-voice] Connection established: ${connectionId}`));

        const setupFlow = () => {
            const stt = createSTT(this.config);
            const tts = createTTS(this.config);

            if (shouldEnableEmotion(this.config)) {
                emotionDetector = new HumeEmotionDetector();
                emotionDetector.connect();
            }

            if (stt instanceof DeepgramFluxSTT) {
                stt.onTurnResumed = () => flow?.interruptTTS();
                stt.onEagerEndOfTurn = (transcript: string) => {
                    console.log(chalk.dim(`[web-voice] Eager EOT: "${transcript}"`));
                };
            }

            flow = new MagmaFlow({
                stt,
                tts,
                config: { pauseDurationMs: 250, sentenceChunkLength: 50 },
                inputFormat: { encoding: 'pcm', sampleRate: 48000, channels: 1 },
                outputFormat: { encoding: 'pcm', sampleRate: 48000, channels: 1 },
                onNormalizedAudio: emotionDetector
                    ? (audio: Buffer) => emotionDetector!.input(audio)
                    : undefined,
                onSpeechDetected: () => {
                    emotionDetector?.unmute();
                    flow?.interruptTTS();
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'clear' }));
                    }
                },
                onTranscription: async (output: MagmaFlowSTTOutput) => {
                    if (!output.text) return;
                    console.log(chalk.cyan(`[web-voice] Transcription: "${output.text}"`));

                    flow?.interruptTTS();
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'clear' }));
                        ws.send(
                            JSON.stringify({ type: 'transcript', data: { text: output.text } }),
                        );
                    }

                    this.agent.setMedium('voice');

                    let toolMessageSent = false;
                    this.agent.setActivityCallback((activity) => {
                        logger.tool(activity);
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'activity', data: activity }));
                        }
                        if (activity.status === 'running' && !toolMessageSent) {
                            toolMessageSent = true;
                            flow?.inputText('Hold on, let me check that.');
                            flow?.inputText(null as unknown as string);
                        }
                    });

                    let messageText = output.text;
                    const emotionTag = emotionDetector?.formatForLLM();
                    if (emotionTag) {
                        messageText = `${emotionTag}\n${output.text}`;
                    }

                    emotionDetector?.mute();
                    await this.agent.chat(messageText, (chunk) => flow?.inputText(chunk));
                    flow?.inputText(null as unknown as string);
                    this.agent.setActivityCallback(undefined);
                },
                onAudioOutput: (buffer: Buffer) => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(
                            JSON.stringify({
                                type: 'audio',
                                data: { audio: buffer.toString('base64') },
                            }),
                        );
                    }
                },
            });

            const conn = this.connections.get(connectionId);
            if (conn) conn.flow = flow;
        };

        ws.on('message', async (data) => {
            try {
                const parsed = JSON.parse(data.toString());

                switch (parsed.type) {
                    case 'medium':
                        if (!flow) {
                            setupFlow();
                            this.agent.setMedium('voice');
                            this.agent
                                .chat('<start />', (chunk) => flow?.inputText(chunk))
                                .then(() => {
                                    flow?.inputText(null as unknown as string);
                                });
                        }
                        console.log(chalk.dim(`[web-voice] Flow initialized`));
                        break;
                    case 'audio':
                        if (!flow) {
                            setupFlow();
                            this.agent.setMedium('voice');
                            this.agent
                                .chat('<start />', (chunk) => flow?.inputText(chunk))
                                .then(() => {
                                    flow?.inputText(null as unknown as string);
                                });
                            console.log(chalk.dim(`[web-voice] Flow initialized (from audio)`));
                        }
                        flow?.inputAudio(Buffer.from(parsed.data.audio, 'base64'));
                        break;
                    default:
                        break;
                }
            } catch (err) {
                console.error(chalk.red(`[web-voice] Parse error: ${(err as Error).message}`));
            }
        });

        ws.on('close', () => {
            console.log(chalk.dim(`[web-voice] Connection closed: ${connectionId}`));
            emotionDetector?.kill();
            this.connections.get(connectionId)?.flow?.kill();
            this.connections.delete(connectionId);
        });

        ws.on('pong', () => {
            const conn = this.connections.get(connectionId);
            if (conn) conn.active = true;
        });

        ws.on('error', (err) => console.error(chalk.red(`[web-voice] Error: ${err.message}`)));

        this.connections.set(connectionId, { id: connectionId, ws, flow, active: true });
    }

    async shutdown(): Promise<void> {
        console.log(chalk.dim('[voice] Shutting down...'));

        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

        for (const [id, conn] of this.connections) {
            try {
                conn.flow?.kill();
                conn.ws.close(1001, 'Server shutting down');
            } catch (err) {
                console.error(chalk.red(`[voice] Error closing ${id}: ${(err as Error).message}`));
            }
        }

        this.connections.clear();

        await Promise.all([
            new Promise<void>((resolve, reject) => {
                this.twilioWss.close((err) => (err ? reject(err) : resolve()));
            }),
            new Promise<void>((resolve, reject) => {
                this.webWss.close((err) => (err ? reject(err) : resolve()));
            }),
        ]);

        console.log(chalk.dim('[voice] Shutdown complete'));
    }
}
