import { getServerUrl } from '$lib/actions/helpers';

export type VoiceState = 'idle' | 'connecting' | 'connected' | 'error';

/** Where Nero is in a turn: the user is talking, Nero is generating, or Nero is
 *  speaking back. Drives the orb and the in-voice activity readout. */
export type TurnPhase = 'listening' | 'thinking' | 'speaking';

/** A tool Nero is running mid-turn, surfaced so voice mode has something live to
 *  watch while he works. */
export interface VoiceActivity {
    id: string;
    status: 'running' | 'success' | 'error';
    details?: { display_name?: string; fn_name?: string };
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
}

/**
 * Open a voice session: capture the mic (with echo cancellation), offer over
 * WebRTC to the Rust media sidecar via the `/v1/voice` relay, and play whatever
 * comes back through an <audio> sink so the browser's AEC can observe it. M1 is
 * a loopback, you hear yourself, clean.
 */
export async function startVoice(events: VoiceEvents): Promise<VoiceSession> {
    const { onState, onTranscript, onTurn, onActivity } = events;
    onState('connecting');

    const pc = new RTCPeerConnection();

    // Inbound audio MUST play through a real media sink for AEC to cancel it.
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.style.display = 'none';
    document.body.appendChild(audio);
    pc.ontrack = (e) => {
        audio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
    };

    pc.oniceconnectionstatechange = () => {
        const st = pc.iceConnectionState;
        console.log('[voice] ice', st);
        if (st === 'connected' || st === 'completed') onState('connected');
        else if (st === 'failed' || st === 'disconnected' || st === 'closed') onState('error');
    };

    const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    for (const track of stream.getAudioTracks()) pc.addTrack(track, stream);

    const wsUrl = getServerUrl('/v1/voice').replace(/^http/, 'ws');
    const ws = new WebSocket(wsUrl);

    ws.onmessage = async (ev) => {
        try {
            const msg = JSON.parse(String(ev.data));
            if (msg.type === 'answer') {
                await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
                console.log('[voice] remote description set');
            } else if (msg.type === 'transcript') {
                console.log('[voice] transcript', msg.final ? '(final)' : '(eager)', msg.text);
                onTranscript?.(msg.text, msg.final);
            } else if (msg.type === 'turn') {
                onTurn?.(msg.state);
            } else if (msg.type === 'activity') {
                onActivity?.(msg.activity);
            } else if (msg.type === 'error') {
                onState('error');
            }
        } catch (e) {
            console.error('[voice] answer apply failed', e);
        }
    };

    ws.onopen = async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await iceGatheringComplete(pc); // non-trickle: ship the full SDP
        ws.send(JSON.stringify({ type: 'offer', sdp: pc.localDescription?.sdp }));
        console.log('[voice] offer sent');
    };
    ws.onerror = () => onState('error');

    function stop() {
        try {
            ws.close();
        } catch {
            /* ignore */
        }
        for (const track of stream.getTracks()) track.stop();
        pc.close();
        audio.remove();
        onState('idle');
    }

    return { stop };
}

/** Resolve once ICE gathering finishes (or after a short safety timeout). */
function iceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
        const done = () => {
            if (pc.iceGatheringState === 'complete') {
                pc.removeEventListener('icegatheringstatechange', done);
                resolve();
            }
        };
        pc.addEventListener('icegatheringstatechange', done);
        setTimeout(resolve, 2000);
    });
}
