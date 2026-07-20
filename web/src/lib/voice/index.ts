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
const BARGE_RMS = 0.045; // mic RMS (0..1) above which speech during playout = a barge
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
    let micBuf: number[] = [];

    // Kill playout immediately + tell the server to abort, without a round-trip wait.
    function bargeLocally() {
        if (!speaking) return;
        speaking = false;
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
                speaking = msg.state === 'speaking';
                onTurn?.(msg.state);
            } else if (msg.type === 'barge') {
                speaking = false;
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
                if (speaking && rms > BARGE_RMS) bargeLocally();
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
