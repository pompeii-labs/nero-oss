/**
 * Interface sound for the dial. Synthesized, not sampled: a detent tick fires dozens
 * of times per drag, so each one has to be near-free and there's no asset to load.
 *
 * One shared AudioContext for the page. The old `chime()` built a context per call
 * and closed it 700ms later, which is fine twice a session and ruinous per tick.
 * The context is created on the gesture that opens the dial, so autoplay policy is
 * satisfied without a separate unlock step.
 */

const KEY = 'nero.sfx';

/** Eight pitches, one per slot, rising clockwise from twelve o'clock. A major
 *  pentatonic over C5, so sweeping the ring sounds like an arpeggio instead of a
 *  buzzer. */
const SEMITONES = [0, 2, 4, 7, 9, 12, 14, 16];
const ROOT = 523.25; // C5

function hz(semitone: number): number {
    return ROOT * Math.pow(2, semitone / 12);
}

class Sfx {
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    /** Muted state persists; the dial is a thing you use a lot. */
    enabled = true;

    constructor() {
        if (typeof localStorage !== 'undefined') {
            this.enabled = localStorage.getItem(KEY) !== 'off';
        }
    }

    setEnabled(on: boolean) {
        this.enabled = on;
        if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, on ? 'on' : 'off');
    }

    /** Lazily build the graph. Returns null when audio isn't available at all. */
    private engine(): { ctx: AudioContext; master: GainNode } | null {
        if (!this.enabled) return null;
        try {
            if (!this.ctx) {
                this.ctx = new AudioContext();
                this.master = this.ctx.createGain();
                this.master.gain.value = 0.5;
                this.master.connect(this.ctx.destination);
            }
            // Suspended after a tab switch or before the first gesture.
            if (this.ctx.state === 'suspended') void this.ctx.resume();
            return this.master ? { ctx: this.ctx, master: this.master } : null;
        } catch {
            return null;
        }
    }

    /** One enveloped oscillator. `at` is an offset in seconds from now. */
    private tone(opts: {
        freq: number;
        dur: number;
        peak: number;
        at?: number;
        type?: OscillatorType;
        glideTo?: number;
        detune?: number;
    }) {
        const e = this.engine();
        if (!e) return;
        const { ctx, master } = e;
        const t = ctx.currentTime + (opts.at ?? 0);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = opts.type ?? 'sine';
        osc.frequency.setValueAtTime(opts.freq, t);
        if (opts.glideTo) osc.frequency.exponentialRampToValueAtTime(opts.glideTo, t + opts.dur);
        if (opts.detune) osc.detune.value = opts.detune;
        // fast attack, exponential tail: reads as a struck object, not a beep
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(opts.peak, t + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
        osc.connect(gain).connect(master);
        osc.start(t);
        osc.stop(t + opts.dur + 0.02);
    }

    /** The ring blooming open: a low swell with a fifth above it. */
    open() {
        this.tone({ freq: 174, glideTo: 349, dur: 0.34, peak: 0.1, type: 'triangle' });
        this.tone({ freq: 523, dur: 0.26, peak: 0.045, at: 0.04 });
        this.tone({ freq: 784, dur: 0.22, peak: 0.03, at: 0.08 });
    }

    /** Crossing into a wedge. Pitched by slot so the ring is playable. */
    tick(slot: number) {
        const f = hz(SEMITONES[slot % SEMITONES.length] ?? 0);
        this.tone({ freq: f, dur: 0.075, peak: 0.055, type: 'triangle' });
        // a soft octave above gives it a glassy edge without raising loudness much
        this.tone({ freq: f * 2, dur: 0.045, peak: 0.018 });
    }

    /** Committing to a wedge: two notes up, brighter than a tick. */
    fire(slot: number) {
        const f = hz(SEMITONES[slot % SEMITONES.length] ?? 0);
        this.tone({ freq: f, dur: 0.1, peak: 0.07, type: 'triangle' });
        this.tone({ freq: f * 1.5, dur: 0.2, peak: 0.06, at: 0.055, type: 'triangle' });
    }

    /** Dismissed without choosing: the open swell, reversed and quieter. */
    close() {
        this.tone({ freq: 349, glideTo: 174, dur: 0.2, peak: 0.05, type: 'triangle' });
    }

    /** A confirm wedge arming. Deliberately less pleasant than `fire`. */
    arm() {
        this.tone({ freq: 330, dur: 0.09, peak: 0.06, type: 'square' });
        this.tone({ freq: 330, dur: 0.09, peak: 0.06, at: 0.12, type: 'square' });
    }
}

export const sfx = new Sfx();
