import * as ort from 'onnxruntime-web';

/**
 * openWakeWord's 3-stage streaming pipeline, ported to onnxruntime-web.
 *
 * raw 16kHz int16-magnitude audio, fed in 1280-sample (80 ms) chunks
 *   -> melspectrogram model  (last 1280+480 samples -> mel frames, 32 bins, /10+2)
 *   -> embedding model       (a 76-frame mel window -> one 96-d embedding per chunk)
 *   -> wakeword model        (the last 16 embeddings -> a 0..1 score)
 *
 * Everything runs client-side in WASM; no audio leaves the device.
 */

const CHUNK = 1280;
const MEL_CTX = 160 * 3; // extra STFT context openWakeWord prepends to each melspec call
const MEL_BINS = 32;
const EMB_WINDOW = 76; // mel frames per embedding
const EMB_DIM = 96;
const WW_FRAMES = 16; // embeddings per wakeword inference
const MEL_MAX = 970; // ~10s of mel frames
const FEAT_MAX = 120; // ~10s of embeddings

export interface DetectorOptions {
    /** URL of the wakeword classifier head (e.g. /wakeword/hey_jarvis_v0.1.onnx). */
    modelUrl: string;
    melUrl?: string;
    embUrl?: string;
    threshold?: number;
    cooldownMs?: number;
    onScore?: (score: number) => void;
    onDetect?: () => void;
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

    /** Feed one 1280-sample int16 frame. Serialized so streaming state stays ordered. */
    feed(frame: Int16Array): void {
        this.chain = this.chain.then(() => this.step(frame)).catch(() => {});
    }

    reset(): void {
        this.raw = new Float32Array(0);
        this.melBuf = [];
        this.feat = [];
    }

    private async step(frame: Int16Array): Promise<void> {
        // Append to the raw buffer (keep ~1s of context).
        const merged = new Float32Array(this.raw.length + frame.length);
        merged.set(this.raw);
        for (let i = 0; i < frame.length; i++) merged[this.raw.length + i] = frame[i];
        this.raw = merged.length > 16000 ? merged.slice(-16000) : merged;
        if (this.raw.length < CHUNK) return;

        // Melspectrogram of the most recent chunk (+ context), transform x/10+2.
        const melInput = this.raw.slice(-(CHUNK + MEL_CTX));
        const melRes = await this.mel.run({
            [this.mel.inputNames[0]]: new ort.Tensor('float32', melInput, [1, melInput.length]),
        });
        const mel = melRes[this.mel.outputNames[0]];
        const md = mel.data as Float32Array;
        const frames = md.length / MEL_BINS;
        for (let f = 0; f < frames; f++) {
            const row = new Float32Array(MEL_BINS);
            for (let b = 0; b < MEL_BINS; b++) row[b] = md[f * MEL_BINS + b] / 10 + 2;
            this.melBuf.push(row);
        }
        if (this.melBuf.length > MEL_MAX) this.melBuf = this.melBuf.slice(-MEL_MAX);
        if (this.melBuf.length < EMB_WINDOW) return;

        // One embedding from the last 76 mel frames.
        const win = new Float32Array(EMB_WINDOW * MEL_BINS);
        const start = this.melBuf.length - EMB_WINDOW;
        for (let f = 0; f < EMB_WINDOW; f++) win.set(this.melBuf[start + f], f * MEL_BINS);
        const embRes = await this.emb.run({
            [this.emb.inputNames[0]]: new ort.Tensor('float32', win, [1, EMB_WINDOW, MEL_BINS, 1]),
        });
        const ed = embRes[this.emb.outputNames[0]].data as Float32Array;
        this.feat.push(ed.slice(-EMB_DIM));
        if (this.feat.length > FEAT_MAX) this.feat = this.feat.slice(-FEAT_MAX);
        if (this.feat.length < WW_FRAMES) return;

        // Score the last 16 embeddings.
        const wwIn = new Float32Array(WW_FRAMES * EMB_DIM);
        const fstart = this.feat.length - WW_FRAMES;
        for (let i = 0; i < WW_FRAMES; i++) wwIn.set(this.feat[fstart + i], i * EMB_DIM);
        const wwRes = await this.ww.run({
            [this.ww.inputNames[0]]: new ort.Tensor('float32', wwIn, [1, WW_FRAMES, EMB_DIM]),
        });
        const score = (wwRes[this.ww.outputNames[0]].data as Float32Array)[0];
        this.opts.onScore?.(score);

        const now = performance.now();
        if (score >= this.threshold && now - this.lastFire > this.cooldownMs) {
            this.lastFire = now;
            this.opts.onDetect?.();
        }
    }
}
