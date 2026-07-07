/**
 * Kokoro TTS provider (self-hostable, on-brand for "nothing leaves the box").
 *
 * Kokoro runs as a local server (kokoro-fastapi) exposing an OpenAI-compatible
 * /v1/audio/speech endpoint. Unlike ElevenLabs' streaming-input socket, it's
 * request/response, so we buffer the token stream and fire a synth per SENTENCE as
 * each completes (first sentence goes out fast; the rest queue). Requests are
 * serialized per turn so audio plays back in order. Kokoro is 24 kHz mono s16le;
 * the sidecar wants 48 kHz, so we 2x-upsample (linear).
 */
import type { VoiceTTS } from './tts';

export interface KokoroTTSOpts {
    /** Base URL of the Kokoro server, e.g. http://localhost:8880 */
    url: string;
    voice: string;
    model?: string;
    /** Raw 48 kHz s16le PCM for a context, as it streams back. */
    onPcm: (pcm: Buffer, contextId: string) => void;
}

/** 24 kHz -> 48 kHz linear upsample (one interpolated sample between each pair). */
function upsample2x(pcm24: Buffer, lastSample: number): { pcm48: Buffer; last: number } {
    const n = pcm24.length >> 1;
    const out = Buffer.alloc(n * 4);
    let prev = lastSample;
    for (let i = 0; i < n; i++) {
        const cur = pcm24.readInt16LE(i * 2);
        out.writeInt16LE((prev + cur) >> 1, i * 4); // interpolated
        out.writeInt16LE(cur, i * 4 + 2); // original
        prev = cur;
    }
    return { pcm48: out, last: prev };
}

export class KokoroStreamingTTS implements VoiceTTS {
    private ctx = '';
    private buf = '';
    private queue: Promise<void> = Promise.resolve();
    private abort: AbortController | null = null;

    constructor(private opts: KokoroTTSOpts) {}

    async beginTurn(contextId: string): Promise<void> {
        this.ctx = contextId;
        this.buf = '';
        this.queue = Promise.resolve();
        this.abort = new AbortController();
    }

    pushText(contextId: string, chunk: string): void {
        if (contextId !== this.ctx) return;
        this.buf += chunk;
        // Fire everything up to the last sentence-ending punctuation; hold the rest.
        const m = this.buf.match(/^(.*[.!?])\s(.*)$/s);
        if (m) {
            this.buf = m[2];
            this.enqueue(m[1], contextId);
        }
    }

    endTurn(contextId: string): void {
        if (contextId !== this.ctx) return;
        if (this.buf.trim()) this.enqueue(this.buf, contextId);
        this.buf = '';
    }

    cancel(contextId: string): void {
        if (contextId !== this.ctx) return;
        this.buf = '';
        this.abort?.abort();
    }

    shutdown(): void {
        this.abort?.abort();
    }

    private enqueue(text: string, contextId: string): void {
        const t = text.trim();
        if (!t) return;
        const signal = this.abort?.signal;
        this.queue = this.queue.then(() => this.synth(t, contextId, signal)).catch(() => {});
    }

    private async synth(text: string, contextId: string, signal?: AbortSignal): Promise<void> {
        if (signal?.aborted) return;
        const res = await fetch(`${this.opts.url}/v1/audio/speech`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.opts.model ?? 'kokoro',
                voice: this.opts.voice,
                input: text,
                response_format: 'pcm',
                stream: true,
            }),
            signal,
        });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        let carry: Buffer | null = null; // odd trailing byte between chunks
        let last = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done || signal?.aborted) break;
            let buf = Buffer.from(value);
            if (carry) {
                buf = Buffer.concat([carry, buf]);
                carry = null;
            }
            if (buf.length & 1) {
                carry = Buffer.from(buf.subarray(buf.length - 1));
                buf = buf.subarray(0, buf.length - 1);
            }
            if (!buf.length) continue;
            const { pcm48, last: l } = upsample2x(buf, last);
            last = l;
            if (contextId === this.ctx && !signal?.aborted) this.opts.onPcm(pcm48, contextId);
        }
    }
}
