import { getServerUrl } from '$lib/actions/helpers';
import { AudioRecorder, AudioPlayer } from '$lib/audio';

export type VoiceState = 'idle' | 'connecting' | 'connected' | 'error';

/** Where Nero is in a turn: the user is talking, Nero is generating, or Nero is
 *  speaking back. Drives the orb and the in-voice activity readout. */
export type TurnPhase = 'listening' | 'thinking' | 'speaking';

/** A tool Nero is running mid-turn, surfaced so voice mode has something live to
 *  watch while he works. */
export interface VoiceActivity {
    id: string;
    status: 'running' | 'success' | 'error';
    details?: { display_name?: string; fn_name?: string; result?: string };
}

export interface VoiceEvents {
    onState: (s: VoiceState) => void;
    /** A transcript of the user's current turn. `final` once the turn ends. */
    onTranscript?: (text: string, final: boolean) => void;
    /** Turn phase: listening (user talking) -> thinking -> speaking. */
    onTurn?: (phase: TurnPhase) => void;
    /** A tool call started/finished during Nero's turn. */
    onActivity?: (activity: VoiceActivity) => void;
}

export interface VoiceSession {
    stop(): void;
    /** Route a panel interaction through the voice turn so Nero speaks the reply. */
    interact(payload: {
        panelId: string;
        control?: string;
        intent?: string;
        value?: unknown;
    }): void;
}

const MIC_CHUNK = 960; // 20 ms of 48 kHz mono, batched before sending

/**
 * Open a voice session over ONE WebSocket (no WebRTC): capture the mic and stream
 * 48kHz s16 PCM up (binary), receive Nero's TTS PCM down (binary) and play it through
 * a Web Audio ring buffer, which stays smooth on bursty TTS (a WebRTC jitter buffer
 * underran and glitched). Full-duplex with barge-in: the mic streams even while Nero
 * speaks (getUserMedia AEC keeps his voice out of it), and talking over him flushes
 * playout + sends `{type:'barge'}`.
 */
// Barge-in VAD: a raw RMS gate can't tell your voice from Nero's own voice leaking past
// echo-cancellation, so require the mic to be LOUD and SUSTAINED, and ignore the first
// moments of playout (echo onset is loudest exactly then). Prevents self-interruption.
const BARGE_RMS = 0.1; // mic RMS (0..1) that counts as voiced during playout
const BARGE_SUSTAIN_MS = 140; // voiced time (leaky) required to barge
const BARGE_GRACE_MS = 500; // don't barge this soon after Nero starts speaking
export async function startVoice(
    events: VoiceEvents,
    opts: { deviceId?: string } = {},
): Promise<VoiceSession> {
    const { onState, onTranscript, onTurn, onActivity } = events;
    onState('connecting');

    // Mic + audio playout need a secure context (HTTPS or localhost). Over plain-HTTP
    // (a LAN IP on a phone) navigator.mediaDevices is undefined.
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        onState('error');
        throw new Error('voice-insecure-context');
    }

    const player = new AudioPlayer();
    await player.connect();
    const recorder = new AudioRecorder();

    let speaking = false; // Nero is speaking -> mic stays open, VAD may barge
    let speakingSince = 0; // when the current playout started (for the onset grace)
    let voiced = 0; // leaky accumulator of voiced mic time (ms)
    let micBuf: number[] = [];

    function setSpeaking(on: boolean) {
        speaking = on;
        if (on) speakingSince = Date.now();
        voiced = 0;
    }

    // Kill playout immediately + tell the server to abort, without a round-trip wait.
    function bargeLocally() {
        if (!speaking) return;
        setSpeaking(false);
        player.clear();
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'barge' }));
        onTurn?.('listening');
    }

    const q = opts.deviceId ? `?device=${encodeURIComponent(opts.deviceId)}` : '';
    const wsUrl = getServerUrl('/v1/voice').replace(/^http/, 'ws') + q;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') {
            player.play(new Int16Array(ev.data as ArrayBuffer));
            return;
        }
        try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'ready') {
                onState('connected');
            } else if (msg.type === 'transcript') {
                onTranscript?.(msg.text, msg.final);
            } else if (msg.type === 'turn') {
                setSpeaking(msg.state === 'speaking');
                onTurn?.(msg.state);
            } else if (msg.type === 'barge') {
                setSpeaking(false);
                player.clear();
                onTurn?.('listening');
            } else if (msg.type === 'activity') {
                onActivity?.(msg.activity);
            } else if (msg.type === 'error') {
                onState('error');
            }
        } catch {
            /* ignore */
        }
    };
    ws.onerror = () => onState('error');

    ws.onopen = async () => {
        try {
            await recorder.start((data, rms) => {
                if (ws.readyState !== WebSocket.OPEN) return;
                // Sustained + loud + past the onset grace = a real barge, not echo. Leaky:
                // voiced time builds while loud, decays 2x while quiet, so brief phoneme
                // dips don't reset it but real silence clears it.
                if (speaking && Date.now() - speakingSince > BARGE_GRACE_MS) {
                    const frameMs = (data.length / 48000) * 1000;
                    voiced = rms > BARGE_RMS ? voiced + frameMs : Math.max(0, voiced - frameMs * 2);
                    if (voiced >= BARGE_SUSTAIN_MS) bargeLocally();
                }
                for (let i = 0; i < data.length; i++) {
                    const s = data[i] > 1 ? 1 : data[i] < -1 ? -1 : data[i];
                    micBuf.push(s * 32767);
                }
                while (micBuf.length >= MIC_CHUNK) {
                    ws.send(Int16Array.from(micBuf.splice(0, MIC_CHUNK)).buffer);
                }
            });
        } catch {
            onState('error');
        }
    };

    function stop() {
        try {
            ws.close();
        } catch {
            /* ignore */
        }
        recorder.stop();
        player.disconnect();
        micBuf = [];
        onState('idle');
    }

    function interact(payload: {
        panelId: string;
        control?: string;
        intent?: string;
        value?: unknown;
    }) {
        if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: 'interact', ...payload }));
    }

    return { stop, interact };
}
