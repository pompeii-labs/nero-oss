import * as ort from 'onnxruntime-web';
import captureUrl from './worklets/capture-processor.ts?worker&url';
import { WakewordDetector, type DetectorOptions } from './detector';

// Single-threaded WASM avoids the COOP/COEP header requirement; the models are tiny.
// Serve the runtime from the same origin so nothing leaves the device.
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = '/ort/';

export type WakewordOptions = Partial<DetectorOptions>;

export class WakewordListener {
    private detector: WakewordDetector;
    private ctx: AudioContext | null = null;
    private source: MediaStreamAudioSourceNode | null = null;
    private node: AudioWorkletNode | null = null;
    private stream: MediaStream | null = null;

    constructor(opts: WakewordOptions = {}) {
        this.detector = new WakewordDetector({
            modelUrl: '/wakeword/hey_nero.onnx',
            ...opts,
        });
    }

    load(): Promise<void> {
        return this.detector.load();
    }

    /** Open the mic and start listening. Throws 'wakeword-insecure-context' off HTTPS. */
    async start(): Promise<void> {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
            throw new Error('wakeword-insecure-context');
        }
        this.stream = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        });
        this.ctx = new AudioContext();
        this.source = this.ctx.createMediaStreamSource(this.stream);
        await this.ctx.audioWorklet.addModule(captureUrl);
        this.node = new AudioWorkletNode(this.ctx, 'wakeword-capture');
        this.source.connect(this.node);
        // Connect to destination so the node is pulled; it writes no output, so it's silent.
        this.node.connect(this.ctx.destination);
        this.node.port.onmessage = (e) => this.detector.feed(e.data as Int16Array);
        this.detector.reset();
    }

    stop(): void {
        this.node?.disconnect();
        this.source?.disconnect();
        void this.ctx?.close();
        this.stream?.getTracks().forEach((t) => t.stop());
        this.node = this.source = this.ctx = this.stream = null;
    }

    get listening(): boolean {
        return this.stream !== null;
    }

    /** Test path: feed raw 16kHz int16 samples directly (no mic), in 1280-sample chunks. */
    feedSamples(samples: Int16Array): void {
        for (let i = 0; i + 1280 <= samples.length; i += 1280) {
            this.detector.feed(samples.slice(i, i + 1280));
        }
    }
}
