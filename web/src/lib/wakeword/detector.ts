import * as ort from 'onnxruntime-web';

/**
 * openWakeWord's 3-stage streaming pipeline, ported to onnxruntime-web.
 *
 * raw 16kHz int16-magnitude audio, fed in 1280-sample (80 ms) chunks
 *   -> melspectrogram model  (last 1280+480 samples -> mel frames, 32 bins, /10+2)
 *   -> embedding model       (a 76-frame mel window -> one 96-d embedding per chunk)
 *   -> wakeword model        (the last 16 embeddings -> a 0..1 score)
 *
 * A VAD gate skips the ONNX chain during silence to save battery. On speech onset it
 * rebuilds context from the buffered raw audio, so a wakeword is never missed.
 * Everything runs client-side in WASM; no audio leaves the device.
 */

const CHUNK = 1280;
const MEL_CTX = 160 * 3;
const MEL_BINS = 32;
const EMB_WINDOW = 76;
const EMB_DIM = 96;
const WW_FRAMES = 16;
const MEL_MAX = 970;
const FEAT_MAX = 120;
const RAW_KEEP = 32000; // 2s, enough to rebuild >=16 embeddings on wake

// VAD thresholds on int16-magnitude RMS (the capture stream has noise suppression on).
const SPEECH_ON = 260;
const SILENCE_OFF = 150;
const SILENCE_HOLD = 25; // ~2s of quiet -> idle

export interface DetectorOptions {
    modelUrl: string;
    melUrl?: string;
    embUrl?: string;
    threshold?: number;
    cooldownMs?: number;
    onScore?: (score: number) => void;
    /** Fires on a wakeword hit with the peak loudness (RMS) of the wake phrase and the
     *  model score, so the server can arbitrate "loudest device wins" across rooms. */
    onDetect?: (rms: number, score: number) => void;
}

export class WakewordDetector {
    private mel!: ort.InferenceSession;
    private emb!: ort.InferenceSession;
    private ww!: ort.InferenceSession;

    private raw: Float32Array = new Float32Array(0);
    private melBuf: Float32Array[] = [];
    private feat: Float32Array[] = [];
    private lastFire = 0;
    private chain: Promise<void> = Promise.resolve();
    private idle = true;
    private silent = 0;
    private threshold: number;
    private cooldownMs: number;

    constructor(private opts: DetectorOptions) {
        this.threshold = opts.threshold ?? 0.5;
        this.cooldownMs = opts.cooldownMs ?? 2000;
    }

    async load(): Promise<void> {
        [this.mel, this.emb, this.ww] = await Promise.all([
            ort.InferenceSession.create(this.opts.melUrl ?? '/wakeword/melspectrogram.onnx'),
            ort.InferenceSession.create(this.opts.embUrl ?? '/wakeword/embedding_model.onnx'),
            ort.InferenceSession.create(this.opts.modelUrl),
        ]);
    }

    feed(frame: Int16Array): void {
        this.chain = this.chain.then(() => this.step(frame)).catch(() => {});
    }

    reset(): void {
        this.raw = new Float32Array(0);
        this.melBuf = [];
        this.feat = [];
        this.idle = true;
        this.silent = 0;
    }

    private rms(frame: Int16Array): number {
        let s = 0;
        for (let i = 0; i < frame.length; i++) s += frame[i] * frame[i];
        return Math.sqrt(s / frame.length);
    }

    /** Peak per-chunk RMS over the last ~1s of buffered audio (the wake phrase). Used
     *  as the "how close is the speaker" signal for cross-device arbitration. */
    private peakRms(): number {
        const win = this.raw.length > 16000 ? this.raw.subarray(this.raw.length - 16000) : this.raw;
        let peak = 0;
        for (let i = 0; i + CHUNK <= win.length; i += CHUNK) {
            let s = 0;
            for (let j = 0; j < CHUNK; j++) {
                const v = win[i + j];
                s += v * v;
            }
            const r = Math.sqrt(s / CHUNK);
            if (r > peak) peak = r;
        }
        return peak;
    }

    private async step(frame: Int16Array): Promise<void> {
        const merged = new Float32Array(this.raw.length + frame.length);
        merged.set(this.raw);
        for (let i = 0; i < frame.length; i++) merged[this.raw.length + i] = frame[i];
        this.raw = merged.length > RAW_KEEP ? merged.slice(-RAW_KEEP) : merged;

        const level = this.rms(frame);

        if (this.idle) {
            if (level < SPEECH_ON) return; // stay idle, no inference
            this.idle = false; // speech onset: wake + rebuild context from the buffer
            this.silent = 0;
            await this.rebuild();
            return;
        }

        await this.melStep(this.raw.slice(-(CHUNK + MEL_CTX)));
        await this.embStep();
        await this.score();

        if (level < SILENCE_OFF) {
            if (++this.silent > SILENCE_HOLD) this.idle = true;
        } else {
            this.silent = 0;
        }
    }

    /** Replay the buffered raw audio to repopulate mel + embedding buffers after idle. */
    private async rebuild(): Promise<void> {
        this.melBuf = [];
        this.feat = [];
        const raw = this.raw;
        const chunks = Math.floor(raw.length / CHUNK);
        for (let c = 1; c <= chunks; c++) {
            const end = c * CHUNK;
            await this.melStep(raw.slice(Math.max(0, end - (CHUNK + MEL_CTX)), end));
            await this.embStep();
        }
        await this.score();
    }

    private async melStep(input: Float32Array): Promise<void> {
        if (input.length < CHUNK) return;
        const res = await this.mel.run({
            [this.mel.inputNames[0]]: new ort.Tensor('float32', input, [1, input.length]),
        });
        const md = res[this.mel.outputNames[0]].data as Float32Array;
        const frames = md.length / MEL_BINS;
        for (let f = 0; f < frames; f++) {
            const row = new Float32Array(MEL_BINS);
            for (let b = 0; b < MEL_BINS; b++) row[b] = md[f * MEL_BINS + b] / 10 + 2;
            this.melBuf.push(row);
        }
        if (this.melBuf.length > MEL_MAX) this.melBuf = this.melBuf.slice(-MEL_MAX);
    }

    private async embStep(): Promise<void> {
        if (this.melBuf.length < EMB_WINDOW) return;
        const win = new Float32Array(EMB_WINDOW * MEL_BINS);
        const start = this.melBuf.length - EMB_WINDOW;
        for (let f = 0; f < EMB_WINDOW; f++) win.set(this.melBuf[start + f], f * MEL_BINS);
        const res = await this.emb.run({
            [this.emb.inputNames[0]]: new ort.Tensor('float32', win, [1, EMB_WINDOW, MEL_BINS, 1]),
        });
        const ed = res[this.emb.outputNames[0]].data as Float32Array;
        this.feat.push(ed.slice(-EMB_DIM));
        if (this.feat.length > FEAT_MAX) this.feat = this.feat.slice(-FEAT_MAX);
    }

    private async score(): Promise<void> {
        if (this.feat.length < WW_FRAMES) return;
        const wwIn = new Float32Array(WW_FRAMES * EMB_DIM);
        const fstart = this.feat.length - WW_FRAMES;
        for (let i = 0; i < WW_FRAMES; i++) wwIn.set(this.feat[fstart + i], i * EMB_DIM);
        const res = await this.ww.run({
            [this.ww.inputNames[0]]: new ort.Tensor('float32', wwIn, [1, WW_FRAMES, EMB_DIM]),
        });
        const s = (res[this.ww.outputNames[0]].data as Float32Array)[0];
        this.opts.onScore?.(s);
        const now = performance.now();
        if (s >= this.threshold && now - this.lastFire > this.cooldownMs) {
            this.lastFire = now;
            this.opts.onDetect?.(this.peakRms(), s);
        }
    }
}
