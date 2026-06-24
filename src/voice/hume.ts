/**
 * Hume Octave 2 TTS over the bidirectional streaming-input WebSocket
 * (wss://api.hume.ai/v0/tts/stream/input). Token stream in, 48 kHz PCM out, which
 * is the sidecar's native rate so there's zero resampling. instant_mode is on by
 * default (~200ms first audio). One warm socket reused across turns via per-turn
 * flush boundaries; barge-in terminates the socket (Hume has no per-context
 * cancel) and a fresh one is opened for the next turn.
 *
 * Same VoiceTTS shape as the ElevenLabs StreamingTTS so the route can swap them.
 */
import type { VoiceTTS } from './tts';

const HUME_VERSION = '2'; // Octave 2: ~100ms model, recommended for conversational

export interface HumeTTSOpts {
    apiKey: string;
    voice: string;
    voiceProvider: 'HUME_AI' | 'CUSTOM_VOICE';
    speed?: number;
    /** Raw 48 kHz s16le PCM for a context, as it streams back. */
    onPcm: (pcm: Buffer, contextId: string) => void;
}

export class HumeStreamingTTS implements VoiceTTS {
    private ws: WebSocket | null = null;
    private opening: Promise<void> | null = null;
    private buf = '';
    private activeContext = '';
    private voiceLoaded = false; // per-socket: voice sent + model warmed
    private sinceFlush = 0;

    constructor(private opts: HumeTTSOpts) {
        void this.ensureOpen();
    }

    private url(): string {
        const q = new URLSearchParams({
            api_key: this.opts.apiKey,
            instant_mode: 'true',
            format_type: 'pcm',
            strip_headers: 'true',
            no_binary: 'true',
            version: HUME_VERSION,
        });
        return `wss://api.hume.ai/v0/tts/stream/input?${q}`;
    }

    private ensureOpen(): Promise<void> {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
        if (this.opening) return this.opening;

        this.opening = new Promise<void>((resolve, reject) => {
            // api_key is in the URL (Hume's WS auth); never log this.url().
            const ws = new WebSocket(this.url());
            this.ws = ws;
            ws.binaryType = 'arraybuffer';
            ws.onopen = () => {
                this.prime(); // warm the voice model now so the first real turn is fast
                resolve();
            };
            ws.onerror = () => reject(new Error('hume ws error'));
            ws.onclose = () => {
                if (this.ws === ws) {
                    this.ws = null;
                    this.opening = null;
                    this.voiceLoaded = false;
                }
            };
            ws.onmessage = (ev) => {
                if (typeof ev.data !== 'string') return;
                let msg: { type?: string; audio?: string };
                try {
                    msg = JSON.parse(ev.data);
                } catch {
                    return;
                }
                if (msg.type === 'audio' && msg.audio && this.activeContext) {
                    this.opts.onPcm(Buffer.from(msg.audio, 'base64'), this.activeContext);
                }
            };
        }).catch((e) => {
            this.ws = null;
            this.opening = null;
            throw e;
        });
        return this.opening;
    }

    private send(obj: unknown): void {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
    }

    /** Throwaway generation at connect time: custom voices cold-load on first use
     *  (~1.6s) then run warm (~350ms). We pay that load up front with activeContext
     *  unset, so the audio is discarded and the first real turn is already warm. */
    private prime(): void {
        if (this.voiceLoaded) return;
        this.send({
            text: 'Hello. ',
            voice: { name: this.opts.voice, provider: this.opts.voiceProvider },
            ...(this.opts.speed != null ? { speed: this.opts.speed } : {}),
        });
        this.send({ flush: true });
        this.voiceLoaded = true;
    }

    async beginTurn(contextId: string): Promise<void> {
        this.buf = '';
        this.sinceFlush = 0;
        this.activeContext = contextId;
        await this.ensureOpen().catch(() => {});
    }

    /** Word-buffered token feed. Hume buffers text server-side and only generates
     *  on flush, so we flush at clause boundaries (and cap the unflushed buffer) to
     *  get first audio out fast instead of waiting for a full sentence or the end
     *  of the turn. Smaller first flush = lower latency, slightly less prosodic
     *  context across that boundary. */
    pushText(_contextId: string, chunk: string): void {
        this.buf += chunk;
        const m = this.buf.match(/^(.*\s)(\S*)$/s);
        if (!m) return;
        const words = m[1];
        this.buf = m[2];

        const frame: Record<string, unknown> = { text: words };
        if (!this.voiceLoaded) {
            frame.voice = { name: this.opts.voice, provider: this.opts.voiceProvider };
            if (this.opts.speed != null) frame.speed = this.opts.speed;
            this.voiceLoaded = true;
        }
        this.send(frame);

        this.sinceFlush += words.length;
        if (/[.!?,;:]["')\]]?\s*$/.test(words) || this.sinceFlush >= 45) {
            this.send({ flush: true });
            this.sinceFlush = 0;
        }
    }

    endTurn(_contextId: string): void {
        if (this.buf.trim()) {
            const frame: Record<string, unknown> = { text: this.buf + ' ' };
            if (!this.voiceLoaded) {
                frame.voice = { name: this.opts.voice, provider: this.opts.voiceProvider };
                if (this.opts.speed != null) frame.speed = this.opts.speed;
                this.voiceLoaded = true;
            }
            this.send(frame);
        }
        this.buf = '';
        this.send({ flush: true });
    }

    /** Barge-in: Hume has no per-context cancel, so drop the socket outright and
     *  warm a fresh one for the next turn. */
    cancel(_contextId: string): void {
        this.buf = '';
        this.activeContext = '';
        try {
            this.ws?.close();
        } catch {
            /* ignore */
        }
        this.ws = null;
        this.opening = null;
        void this.ensureOpen();
    }

    shutdown(): void {
        this.send({ close: true });
        try {
            this.ws?.close();
        } catch {
            /* ignore */
        }
        this.ws = null;
        this.opening = null;
    }
}
