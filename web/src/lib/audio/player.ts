import playbackProcessorUrl from './worklets/playback-processor.ts?worker&url';

export class AudioPlayer {
    private audioContext: AudioContext | null = null;
    private workletNode: AudioWorkletNode | null = null;
    private isPlaying = false;
    private onStop: (() => void) | null = null;

    async connect(onStop?: () => void): Promise<void> {
        this.onStop = onStop || null;
        this.audioContext = new AudioContext({ sampleRate: 48000 });

        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        await this.audioContext.audioWorklet.addModule(playbackProcessorUrl);
    }

    play(int16Array: Int16Array): void {
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

    clear(): void {
        this.workletNode?.port.postMessage({ event: 'clear' });
    }

    stop(): void {
        this.workletNode?.port.postMessage({ event: 'stop' });
    }

    disconnect(): void {
        this.stop();
        this.audioContext?.close();
        this.audioContext = null;
        this.workletNode = null;
    }

    get playing(): boolean {
        return this.isPlaying;
    }
}
