import rmsProcessorUrl from './worklets/rms-processor.ts?worker&url';

export class AudioRecorder {
    private audioContext: AudioContext | null = null;
    private source: MediaStreamAudioSourceNode | null = null;
    private workletNode: AudioWorkletNode | null = null;
    private scriptNode: ScriptProcessorNode | null = null;
    private mediaStream: MediaStream | null = null;
    private onData: ((data: Float32Array, rms: number) => void) | null = null;

    async start(onData: (data: Float32Array, rms: number) => void): Promise<void> {
        this.onData = onData;

        this.mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                sampleRate: 48000,
                sampleSize: 16,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
            },
        });

        this.audioContext = new AudioContext({ sampleRate: 48000 });
        this.source = this.audioContext.createMediaStreamSource(this.mediaStream);

        try {
            await this.audioContext.audioWorklet.addModule(rmsProcessorUrl);
            this.workletNode = new AudioWorkletNode(this.audioContext, 'rms-processor');
            this.source.connect(this.workletNode);
            this.workletNode.connect(this.audioContext.destination);

            this.workletNode.port.onmessage = (event) => {
                const { rms, audioData } = event.data;
                this.onData?.(audioData, rms);
            };
        } catch {
            this.scriptNode = this.audioContext.createScriptProcessor(128, 1, 1);
            this.source.connect(this.scriptNode);
            this.scriptNode.connect(this.audioContext.destination);

            this.scriptNode.onaudioprocess = (event) => {
                const channel = event.inputBuffer.getChannelData(0);
                const audioData = new Float32Array(channel);
                let sum = 0;
                for (let i = 0; i < audioData.length; i++) {
                    sum += audioData[i] * audioData[i];
                }
                const rms = Math.sqrt(sum / audioData.length);
                this.onData?.(audioData, rms);
            };
        }
    }

    stop(): void {
        this.workletNode?.disconnect();
        this.scriptNode?.disconnect();
        this.source?.disconnect();
        this.audioContext?.close();
        this.mediaStream?.getTracks().forEach((track) => track.stop());

        this.workletNode = null;
        this.scriptNode = null;
        this.source = null;
        this.audioContext = null;
        this.mediaStream = null;
        this.onData = null;
    }

    mute(): void {
        this.mediaStream?.getAudioTracks().forEach((track) => (track.enabled = false));
    }

    unmute(): void {
        this.mediaStream?.getAudioTracks().forEach((track) => (track.enabled = true));
    }

    get isMuted(): boolean {
        const tracks = this.mediaStream?.getAudioTracks();
        return tracks ? !tracks[0]?.enabled : true;
    }
}
