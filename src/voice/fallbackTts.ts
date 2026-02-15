import { MagmaFlowTextToSpeech } from '@pompeii-labs/audio/voice';
import chalk from 'chalk';

export class FallbackTTS extends MagmaFlowTextToSpeech {
    private primary: MagmaFlowTextToSpeech;
    private fallback: MagmaFlowTextToSpeech;
    private pendingTexts: Map<string, string> = new Map();
    private gotAudio: Set<string> = new Set();
    private usingFallback: Set<string> = new Set();

    constructor(primary: MagmaFlowTextToSpeech, fallback: MagmaFlowTextToSpeech) {
        super();
        this.primary = primary;
        this.fallback = fallback;

        this.primary.onOutput = (audio: Buffer | null, requestId: string) => {
            if (this.usingFallback.has(requestId)) return;

            if (audio) {
                this.gotAudio.add(requestId);
                this.onOutput(audio, requestId);
            } else {
                if (!this.gotAudio.has(requestId) && this.pendingTexts.has(requestId)) {
                    const text = this.pendingTexts.get(requestId)!;
                    console.log(chalk.yellow('[tts] Primary failed, falling back'));
                    this.usingFallback.add(requestId);
                    this.pendingTexts.delete(requestId);
                    this.fallback.input(text, requestId);
                } else {
                    this.pendingTexts.delete(requestId);
                    this.gotAudio.delete(requestId);
                    this.onOutput(null, requestId);
                }
            }
        };

        this.fallback.onOutput = (audio: Buffer | null, requestId: string) => {
            this.onOutput(audio, requestId);
            if (!audio) {
                this.usingFallback.delete(requestId);
                this.pendingTexts.delete(requestId);
                this.gotAudio.delete(requestId);
            }
        };
    }

    input(text: string | null, requestId: string): void {
        if (!text) {
            this.primary.input(text, requestId);
            return;
        }
        this.pendingTexts.set(requestId, text);
        this.primary.input(text, requestId);
    }

    kill(): void {
        this.primary.kill();
        this.fallback.kill();
        this.pendingTexts.clear();
        this.gotAudio.clear();
        this.usingFallback.clear();
    }

    reset(): void {
        (this.primary as any).reset?.();
        (this.fallback as any).reset?.();
    }
}
