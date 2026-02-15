import { HumeClient } from 'hume';
import WebSocket from 'ws';
import chalk from 'chalk';

export interface EmotionReading {
    name: string;
    score: number;
}

const BUFFER_TARGET_BYTES = 240_000;
const MIN_EMOTION_SCORE = 0.3;
const TOP_EMOTIONS_COUNT = 3;

function createWavHeader(
    pcmLength: number,
    sampleRate: number,
    channels: number,
    bitsPerSample: number,
): Buffer {
    const header = Buffer.alloc(44);
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcmLength, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcmLength, 40);

    return header;
}

export class HumeEmotionDetector {
    private client: HumeClient;
    private socket: ReturnType<HumeClient['expressionMeasurement']['stream']['connect']> | null;
    private pcmBuffer: Buffer[];
    private bufferBytes: number;
    private latestEmotions: EmotionReading[];
    private connected: boolean;
    private muted: boolean;

    constructor() {
        this.client = new HumeClient({ apiKey: process.env.HUME_API_KEY! });
        this.socket = null;
        this.pcmBuffer = [];
        this.bufferBytes = 0;
        this.latestEmotions = [];
        this.connected = false;
        this.muted = false;
    }

    connect(): void {
        try {
            this.socket = this.client.expressionMeasurement.stream.connect({
                config: { prosody: {} },
                onOpen: () => {
                    this.connected = true;
                    console.log(chalk.dim('[emotion] Connected to Hume Expression Measurement'));
                },
                onError: (err) => {
                    console.error(
                        chalk.red(
                            `[emotion] WebSocket error: ${err.error ?? err.code ?? 'unknown'}`,
                        ),
                    );
                    this.connected = false;
                },
                onClose: () => {
                    console.log(chalk.dim('[emotion] WebSocket closed'));
                    this.connected = false;
                },
            });

            this.socket.websocket.on('message', (data: WebSocket.Data) => {
                try {
                    const response = JSON.parse(data.toString());
                    this.handleResponse(response);
                } catch {}
            });
        } catch (err) {
            console.error(chalk.red(`[emotion] Failed to connect: ${(err as Error).message}`));
            this.connected = false;
        }
    }

    mute(): void {
        this.muted = true;
        this.pcmBuffer = [];
        this.bufferBytes = 0;
    }

    unmute(): void {
        this.muted = false;
    }

    input(pcmAudio: Buffer): void {
        if (this.muted) return;

        this.pcmBuffer.push(pcmAudio);
        this.bufferBytes += pcmAudio.length;

        if (this.bufferBytes >= BUFFER_TARGET_BYTES) {
            this.flush();
        }
    }

    private flush(): void {
        if (this.pcmBuffer.length === 0) return;

        const pcmData = Buffer.concat(this.pcmBuffer);
        this.pcmBuffer = [];
        this.bufferBytes = 0;

        if (!this.socket || !this.connected) return;

        const ws = this.socket.websocket;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        try {
            const wavHeader = createWavHeader(pcmData.length, 48000, 1, 16);
            const wavBuffer = Buffer.concat([wavHeader, pcmData]);
            const base64Audio = wavBuffer.toString('base64');

            const payload = JSON.stringify({
                data: base64Audio,
                models: { prosody: {} },
                raw_text: false,
            });

            ws.send(payload);
        } catch (err) {
            console.error(chalk.red(`[emotion] Send error: ${(err as Error).message}`));
            this.connected = false;
        }
    }

    private handleResponse(response: any): void {
        try {
            const predictions = response?.prosody?.predictions;
            if (!predictions || predictions.length === 0) return;

            const allEmotions: EmotionReading[] = [];
            for (const prediction of predictions) {
                if (prediction.emotions) {
                    allEmotions.push(
                        ...prediction.emotions.map((e: any) => ({
                            name: e.name as string,
                            score: e.score as number,
                        })),
                    );
                }
            }

            if (allEmotions.length === 0) return;

            const emotionMap = new Map<string, number>();
            for (const e of allEmotions) {
                const existing = emotionMap.get(e.name) ?? 0;
                emotionMap.set(e.name, Math.max(existing, e.score));
            }

            const sorted = Array.from(emotionMap.entries())
                .filter(([, score]) => score > MIN_EMOTION_SCORE)
                .sort((a, b) => b[1] - a[1])
                .slice(0, TOP_EMOTIONS_COUNT)
                .map(([name, score]) => ({ name, score }));

            if (sorted.length > 0) {
                this.latestEmotions = sorted;
                console.log(
                    chalk.dim(
                        `[emotion] ${sorted.map((e) => `${e.name} ${e.score.toFixed(2)}`).join(', ')}`,
                    ),
                );
            }
        } catch (err) {
            console.error(chalk.red(`[emotion] Parse error: ${(err as Error).message}`));
        }
    }

    getLatestEmotions(): EmotionReading[] {
        return this.latestEmotions;
    }

    formatForLLM(): string | null {
        if (this.latestEmotions.length === 0) return null;
        const formatted = this.latestEmotions
            .map((e) => `${e.name} ${e.score.toFixed(2)}`)
            .join(', ');
        return `<caller_emotion>${formatted}</caller_emotion>`;
    }

    kill(): void {
        this.connected = false;
        this.pcmBuffer = [];
        this.bufferBytes = 0;
        this.latestEmotions = [];
        try {
            this.socket?.close();
        } catch {}
        this.socket = null;
    }
}
