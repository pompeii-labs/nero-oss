// @ts-nocheck -- AudioWorklet global scope, not standard TS context
//
// Runs in an AudioContext created at 16 kHz, so the input is already resampled.
// Accumulates 1280-sample (80 ms) frames and posts them as Int16 (the melspectrogram
// model wants int16-magnitude samples), the unit openWakeWord streams in.

const FRAME = 1280;

class WakewordCaptureProcessor extends AudioWorkletProcessor {
    private buf = new Int16Array(FRAME);
    private n = 0;

    process(inputs: Float32Array[][]): boolean {
        const ch = inputs[0]?.[0];
        if (!ch) return true;
        for (let i = 0; i < ch.length; i++) {
            let s = ch[i];
            s = s > 1 ? 1 : s < -1 ? -1 : s;
            this.buf[this.n++] = s * 32767;
            if (this.n === FRAME) {
                const out = this.buf.slice();
                this.port.postMessage(out, [out.buffer]);
                this.n = 0;
            }
        }
        return true;
    }
}

registerProcessor('wakeword-capture', WakewordCaptureProcessor);
