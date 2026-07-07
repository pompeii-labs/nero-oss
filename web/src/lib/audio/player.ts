/**
 * Streaming PCM playout via scheduled AudioBufferSourceNodes, the classic smooth
 * approach. Each 48kHz s16 chunk becomes an AudioBuffer scheduled back-to-back on the
 * AudioContext clock, so playback is sample-accurate and jitter-tolerant, and Web Audio
 * resamples cleanly if the context isn't 48kHz (iOS Safari often forces 44.1kHz). No
 * AudioWorklet, so no heavy work on the audio thread (that was the stutter).
 */
export class AudioPlayer {
    private ctx: AudioContext | null = null;
    private nextTime = 0;
    private readonly lead = 0.2; // seconds of scheduling cushion to absorb WS jitter
    private sources = new Set<AudioBufferSourceNode>();

    async connect(): Promise<void> {
        this.ctx = new AudioContext({ sampleRate: 48000 });
        if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
        this.nextTime = 0;
    }

    async tryResume(): Promise<boolean> {
        if (!this.ctx) return false;
        if ((this.ctx.state as string) === 'running') return true;
        try {
            await this.ctx.resume();
        } catch {
            /* ignore */
        }
        return (this.ctx.state as string) === 'running';
    }

    get suspended(): boolean {
        return this.ctx?.state === 'suspended';
    }

    /** Schedule a 48kHz s16 mono chunk to play right after the previously queued audio. */
    play(int16: Int16Array): void {
        const ctx = this.ctx;
        if (!ctx || !int16.length) return;
        const f = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) f[i] = int16[i] / 32768;
        // Buffer at the source rate (48k); Web Audio resamples to the context rate.
        const buf = ctx.createBuffer(1, f.length, 48000);
        buf.getChannelData(0).set(f);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        const now = ctx.currentTime;
        // Back-to-back; if we've fallen behind (a real gap), resume with a fresh lead.
        if (this.nextTime < now + 0.02) this.nextTime = now + this.lead;
        src.start(this.nextTime);
        this.nextTime += buf.duration;
        this.sources.add(src);
        src.onended = () => this.sources.delete(src);
    }

    /** Barge-in: stop everything queued and reset the clock. */
    clear(): void {
        for (const s of this.sources) {
            try {
                s.stop();
            } catch {
                /* already ended */
            }
        }
        this.sources.clear();
        if (this.ctx) this.nextTime = this.ctx.currentTime;
    }

    stop(): void {
        this.clear();
    }

    disconnect(): void {
        this.clear();
        void this.ctx?.close();
        this.ctx = null;
    }

    get playing(): boolean {
        return !!this.ctx && this.ctx.currentTime < this.nextTime;
    }
}
