class RMSProcessor extends AudioWorkletProcessor {
    process(inputs: Float32Array[][]): boolean {
        const input = inputs[0];
        const channel = input?.[0];

        if (!channel) return true;

        const sum = channel.reduce((acc, val) => acc + val * val, 0);
        const rms = Math.sqrt(sum / channel.length);

        this.port.postMessage({ rms, audioData: channel });

        return true;
    }
}

registerProcessor('rms-processor', RMSProcessor);
