/**
 * ElevenLabs multi-context streaming-input TTS over a single persistent
 * WebSocket. One socket stays warm across turns; each turn is its own context.
 *
 * Why not @pompeii-labs/audio's ElevenLabsTTS: that fires a fresh HTTP request
 * per `input()` call, so every sentence re-pays connection + TTFB, and its
 * reset()/kill() are no-ops (no real barge-in). Here we stream Haiku's tokens
 * straight in (word-buffered), first audio fires after ~chunk_length_schedule[0]
 * characters, and barge-in is a real hard cancel (close_context).
 *
 * Output is pcm_48000 (raw s16le mono 48 kHz), fed straight to the Rust sidecar's
 * Opus encoder. Requires an ElevenLabs Pro tier for 48 kHz PCM.
 */

const DEFAULT_VOICE_SETTINGS = {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0, // >0 adds inference latency
    use_speaker_boost: false, // speaker boost adds compute/latency for inaudible gain over Opus
    speed: 1,
};

// auto_mode lets ElevenLabs trigger generation at its own natural boundaries as
// tokens stream in, fastest first audio for a token stream, and unlike a manual
// chunk_length_schedule (min first threshold ~50 chars) it doesn't sit waiting on
// a character count before the first clause. Under auto_mode the schedule is
// ignored, so we don't send one.

/**
 * Split a token buffer at the last whitespace: return the complete-words prefix
 * to send (kept with its trailing space so words don't glue across frames) and
 * the partial-word remainder to hold for the next token. `send` is null when no
 * whole word has formed yet.
 */
export function chunkOnWhitespace(buf: string): { send: string | null; rest: string } {
    const m = buf.match(/^(.*\s)(\S*)$/s);
    return m ? { send: m[1], rest: m[2] } : { send: null, rest: buf };
}

/** The TTS contract the voice route drives, one context (turn) at a time.
 *  Implemented by both the ElevenLabs (StreamingTTS) and Hume providers. */
export interface VoiceTTS {
    beginTurn(contextId: string): Promise<void>;
    pushText(contextId: string, chunk: string): void;
    endTurn(contextId: string): void;
    cancel(contextId: string): void;
    shutdown(): void;
}

export interface StreamingTTSOpts {
    voice: string;
    model: string;
    apiKey: string;
    /** Raw 48 kHz s16le PCM for a context, as it streams back. */
    onPcm: (pcm: Buffer, contextId: string) => void;
}

export class StreamingTTS implements VoiceTTS {
    private ws: WebSocket | null = null;
    private opening: Promise<void> | null = null;
    private buf = '';

    constructor(private opts: StreamingTTSOpts) {
        void this.ensureOpen();
    }

    private url(): string {
        const q = new URLSearchParams({
            model_id: this.opts.model,
            output_format: 'pcm_48000',
            inactivity_timeout: '180',
            auto_mode: 'true',
        });
        return `wss://api.elevenlabs.io/v1/text-to-speech/${this.opts.voice}/multi-stream-input?${q}`;
    }

    /** Open the socket if needed; resolve once it's ready to take frames. */
    private ensureOpen(): Promise<void> {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
        if (this.opening) return this.opening;

        this.opening = new Promise<void>((resolve, reject) => {
            // Bun supports a headers option on the WS client; keeps the key out of the URL.
            const ws = new WebSocket(this.url(), {
                headers: { 'xi-api-key': this.opts.apiKey },
            } as unknown as string[]);
            this.ws = ws;
            ws.binaryType = 'arraybuffer';
            ws.onopen = () => resolve();
            ws.onerror = () => reject(new Error('elevenlabs ws error'));
            ws.onclose = () => {
                if (this.ws === ws) {
                    this.ws = null;
                    this.opening = null;
                }
            };
            ws.onmessage = (ev) => {
                if (typeof ev.data !== 'string') return;
                let msg: { audio?: string | null; contextId?: string };
                try {
                    msg = JSON.parse(ev.data);
                } catch {
                    return;
                }
                if (msg.audio && msg.contextId) {
                    this.opts.onPcm(Buffer.from(msg.audio, 'base64'), msg.contextId);
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

    /** Begin a turn: open a fresh context with voice settings + chunk schedule. */
    async beginTurn(contextId: string): Promise<void> {
        this.buf = '';
        await this.ensureOpen().catch(() => {});
        this.send({
            text: ' ',
            context_id: contextId,
            voice_settings: DEFAULT_VOICE_SETTINGS,
        });
    }

    /** Feed a token chunk; sends on word boundaries with a trailing space so
     *  words don't glue across frames, and partial words wait for the next chunk. */
    pushText(contextId: string, chunk: string): void {
        this.buf += chunk;
        const { send, rest } = chunkOnWhitespace(this.buf);
        if (send) {
            this.send({ text: send, context_id: contextId });
            this.buf = rest;
        }
    }

    /** Normal end-of-turn: flush the tail so a short final clause renders now
     *  instead of stalling under the chunk-length threshold. */
    endTurn(contextId: string): void {
        if (this.buf.trim()) this.send({ text: this.buf + ' ', context_id: contextId });
        this.buf = '';
        this.send({ text: '', context_id: contextId, flush: true });
    }

    /** Barge-in: hard-cancel in-flight generation for this context and drop its buffer. */
    cancel(contextId: string): void {
        this.buf = '';
        this.send({ context_id: contextId, close_context: true });
    }

    shutdown(): void {
        this.send({ close_socket: true });
        try {
            this.ws?.close();
        } catch {
            /* ignore */
        }
        this.ws = null;
        this.opening = null;
    }
}
