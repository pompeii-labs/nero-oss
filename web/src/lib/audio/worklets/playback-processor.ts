interface WriteMessage {
    event: 'write';
    buffer: Int16Array;
}

interface ClearMessage {
    event: 'clear';
}

interface StopMessage {
    event: 'stop';
}

type ProcessorMessage = WriteMessage | ClearMessage | StopMessage;

class PlaybackProcessor extends AudioWorkletProcessor {
    private hasStarted = false;
    private stopped = false;
    private outputBuffers: Float32Array[] = [];
    private bufferLength = 128;
    private currentBuffer: Float32Array = new Float32Array(this.bufferLength);
    private writeOffset = 0;

    constructor() {
        super();
        this.port.onmessage = (event: MessageEvent<ProcessorMessage>) => {
            const { data } = event;
            if (data.event === 'write') {
                const int16 = data.buffer;
                const float32 = new Float32Array(int16.length);
                for (let i = 0; i < int16.length; i++) {
                    float32[i] = int16[i] / 0x8000;
                }
                this.writeData(float32);
            } else if (data.event === 'clear') {
                this.outputBuffers = [];
                this.currentBuffer = new Float32Array(this.bufferLength);
                this.writeOffset = 0;
            } else if (data.event === 'stop') {
                this.stopped = true;
            }
        };
    }

    writeData(float32: Float32Array): void {
        let offset = this.writeOffset;
        for (let i = 0; i < float32.length; i++) {
            this.currentBuffer[offset++] = float32[i];
            if (offset >= this.bufferLength) {
                this.outputBuffers.push(this.currentBuffer);
                this.currentBuffer = new Float32Array(this.bufferLength);
                offset = 0;
            }
        }
        this.writeOffset = offset;
    }

    process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
        const output = outputs[0][0];

        if (this.stopped) {
            this.port.postMessage({ event: 'stop' });
            return false;
        }

        if (this.outputBuffers.length) {
            this.hasStarted = true;
            const buffer = this.outputBuffers.shift()!;
            for (let i = 0; i < output.length; i++) {
                output[i] = buffer[i] || 0;
            }
            return true;
        }

        if (this.hasStarted) {
            this.port.postMessage({ event: 'stop' });
            return false;
        }

        return true;
    }
}

registerProcessor('playback-processor', PlaybackProcessor);
