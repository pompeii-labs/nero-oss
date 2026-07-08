// @ts-nocheck -- AudioWorklet global scope, not standard TS context
//
// Downsamples the mic from the context's hardware rate (iOS Safari won't honour a
// forced 16kHz AudioContext) to 16 kHz via phase-accumulated averaging, then emits
// 1280-sample (80 ms @16k) Int16 frames, the unit openWakeWord streams in.

const TARGET = 16000;
const FRAME = 1280;

class WakewordCaptureProcessor extends AudioWorkletProcessor {
    private ratio = sampleRate / TARGET;
    private acc = 0;
    private accN = 0;
    private phase = 0;
    private buf = new Int16Array(FRAME);
    private n = 0;

    process(inputs: Float32Array[][]): boolean {
        const ch = inputs[0]?.[0];
        if (!ch) return true;
        for (let i = 0; i < ch.length; i++) {
            this.acc += ch[i];
            this.accN++;
            this.phase += 1;
            if (this.phase >= this.ratio) {
                this.phase -= this.ratio;
                let s = this.acc / this.accN;
                this.acc = 0;
                this.accN = 0;
                s = s > 1 ? 1 : s < -1 ? -1 : s;
                this.buf[this.n++] = s * 32767;
                if (this.n === FRAME) {
                    const out = this.buf.slice();
                    this.port.postMessage(out, [out.buffer]);
                    this.n = 0;
                }
            }
        }
        return true;
    }
}

registerProcessor('wakeword-capture', WakewordCaptureProcessor);
