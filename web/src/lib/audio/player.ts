import playbackProcessorUrl from './worklets/playback-processor.ts?worker&url';

export class AudioPlayer {
    private audioContext: AudioContext | null = null;
    private workletNode: AudioWorkletNode | null = null;
    private scriptNode: ScriptProcessorNode | null = null;
    private useWorklet = true;
    private isPlaying = false;
    private onStop: (() => void) | null = null;

    private scriptBuffers: Float32Array[] = [];
    private scriptHasStarted = false;

    async connect(onStop?: () => void): Promise<void> {
        this.onStop = onStop || null;
        this.audioContext = new AudioContext({ sampleRate: 48000 });

        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        try {
            await this.audioContext.audioWorklet.addModule(playbackProcessorUrl);
            this.useWorklet = true;
        } catch {
            this.useWorklet = false;
        }
    }

    play(int16Array: Int16Array): void {
        if (!this.audioContext) return;

        if (this.useWorklet) {
            this.playWorklet(int16Array);
        } else {
            this.playScript(int16Array);
        }
    }

    private playWorklet(int16Array: Int16Array): void {
        if (!this.audioContext) return;

        if (!this.workletNode) {
            this.workletNode = new AudioWorkletNode(this.audioContext, 'playback-processor');
            this.workletNode.connect(this.audioContext.destination);
            this.workletNode.port.onmessage = (e) => {
                if (e.data.event === 'stop') {
                    this.isPlaying = false;
                    this.workletNode?.disconnect();
                    this.workletNode = null;
                    this.onStop?.();
                }
            };
        }

        this.isPlaying = true;
        this.workletNode.port.postMessage({ event: 'write', buffer: int16Array });
    }

    private playScript(int16Array: Int16Array): void {
        if (!this.audioContext) return;

        const float32 = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32[i] = int16Array[i] / 0x8000;
        }

        const bufferLength = 128;
        for (let offset = 0; offset < float32.length; offset += bufferLength) {
            const chunk = new Float32Array(bufferLength);
            const end = Math.min(offset + bufferLength, float32.length);
            for (let i = 0; i < end - offset; i++) {
                chunk[i] = float32[offset + i];
            }
            this.scriptBuffers.push(chunk);
        }

        if (!this.scriptNode) {
            this.scriptNode = this.audioContext.createScriptProcessor(128, 0, 1);
            this.scriptNode.connect(this.audioContext.destination);

            this.scriptNode.onaudioprocess = (event) => {
                const output = event.outputBuffer.getChannelData(0);

                if (this.scriptBuffers.length) {
                    this.scriptHasStarted = true;
                    const buffer = this.scriptBuffers.shift()!;
                    for (let i = 0; i < output.length; i++) {
                        output[i] = buffer[i] || 0;
                    }
                    return;
                }

                for (let i = 0; i < output.length; i++) output[i] = 0;

                if (this.scriptHasStarted) {
                    this.scriptHasStarted = false;
                    this.isPlaying = false;
                    this.scriptNode?.disconnect();
                    this.scriptNode = null;
                    this.onStop?.();
                }
            };
        }

        this.isPlaying = true;
    }

    clear(): void {
        if (this.useWorklet) {
            this.workletNode?.port.postMessage({ event: 'clear' });
        } else {
            this.scriptBuffers = [];
        }
    }

    stop(): void {
        if (this.useWorklet) {
            this.workletNode?.port.postMessage({ event: 'stop' });
        } else {
            this.scriptBuffers = [];
            this.scriptHasStarted = false;
            this.isPlaying = false;
            this.scriptNode?.disconnect();
            this.scriptNode = null;
            this.onStop?.();
        }
    }

    disconnect(): void {
        this.stop();
        this.audioContext?.close();
        this.audioContext = null;
        this.workletNode = null;
        this.scriptNode = null;
    }

    get playing(): boolean {
        return this.isPlaying;
    }
}
