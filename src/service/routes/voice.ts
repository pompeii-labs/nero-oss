import { Hono } from 'hono';
import type { UpgradeWebSocket } from 'hono/ws';
import { DeepgramFluxSTT } from '@pompeii-labs/audio/voice';
import { loadConfig } from '../../config';
import { runVoiceTurn } from '../../voice/turn';
import { StreamingTTS, type VoiceTTS } from '../../voice/tts';
import { HumeStreamingTTS } from '../../voice/hume';

let nextPeer = 1;

const TTS_VOICE = process.env.NERO_TTS_VOICE || 'iP95p4xoKVk53GoZ742B'; // ElevenLabs "chris"
const TTS_MODEL = process.env.NERO_TTS_MODEL || 'eleven_flash_v2_5'; // low-latency

// Provider: hume when a Hume key is present (and not forced off), else ElevenLabs.
const TTS_PROVIDER =
    process.env.NERO_TTS_PROVIDER || (process.env.HUME_API_KEY ? 'hume' : 'elevenlabs');

/** Build the per-session streaming TTS for the active provider. */
function makeTTS(onPcm: (pcm: Buffer, contextId: string) => void): VoiceTTS {
    if (TTS_PROVIDER === 'hume') {
        return new HumeStreamingTTS({
            apiKey: process.env.HUME_API_KEY ?? '',
            voice: process.env.NERO_HUME_VOICE || 'Nero',
            voiceProvider:
                (process.env.NERO_HUME_PROVIDER as 'HUME_AI' | 'CUSTOM_VOICE') || 'CUSTOM_VOICE',
            speed: Number(process.env.NERO_HUME_SPEED) || 0.9, // a touch slower than default
            onPcm,
        });
    }
    return new StreamingTTS({
        model: TTS_MODEL,
        voice: TTS_VOICE,
        apiKey: process.env.ELEVENLABS_API_KEY ?? '',
        onPcm,
    });
}

/** Frame 48 kHz linear16 PCM as a Tts binary packet for the media sidecar. */
function frameTts(peer: number, seq: number, pcm: Buffer): Buffer {
    const header = Buffer.alloc(12);
    header.writeUInt32LE(peer, 0);
    header.writeUInt8(1, 4); // dir = Tts
    header.writeUInt8(0, 5); // reserved
    header.writeUInt16LE(48, 6); // rate kHz
    header.writeUInt32LE(seq, 8);
    return Buffer.concat([header, pcm]);
}

/**
 * The browser's voice session. Four legs:
 *   browser <-WS-> here:    SDP signaling + transcripts/turn-state down.
 *   here <-WS-> sidecar:    SDP up, mic PCM down, TTS PCM up.
 *   here <-WS-> Deepgram:   mic PCM up, transcripts + turn detection down.
 *   here -> ElevenLabs:     response text up, TTS PCM down (-> sidecar -> browser).
 * On a finished turn the harness runs (same mind/history as chat) and speaks back.
 */
export function voiceRoutes(upgradeWebSocket: UpgradeWebSocket): Hono {
    const app = new Hono();

    app.get(
        '/v1/voice',
        upgradeWebSocket(() => {
            const peer = nextPeer++;
            let sidecar: WebSocket | null = null;
            let pendingOffer: string | null = null;
            let flux: DeepgramFluxSTT | null = null;
            let tts: VoiceTTS | null = null;

            let turnActive = false;
            let turnAbort: AbortController | null = null;
            let currentReqId = '';
            let ttsSeq = 0;
            // latency marks for the current turn
            let tEot = 0;
            let tFirstText = 0;
            let tFirstAudio = 0;
            // Estimated wall-clock when the buffered TTS finishes playing out. Nero
            // keeps speaking well after generation ends (the sidecar plays the
            // backlog at realtime), so this, not turnActive, is what makes a turn
            // interruptible during speech.
            let speakingUntil = 0;
            let ttsSamples = 0;
            let listenTimer: ReturnType<typeof setTimeout> | null = null;

            const sendOpen = (sdp: string) =>
                sidecar?.send(JSON.stringify({ t: 'peer_open', peer, sdp_offer: sdp }));

            const isBusy = () => turnActive || Date.now() < speakingUntil;

            // The user started talking over Nero: hard-cancel the synth context, drop
            // the sidecar's buffered audio, and kill the in-flight generation.
            const bargeIn = (ws: WSLike) => {
                if (!isBusy()) return;
                turnAbort?.abort();
                if (currentReqId) tts?.cancel(currentReqId);
                sidecar?.send(JSON.stringify({ t: 'interrupt', peer }));
                speakingUntil = 0;
                if (listenTimer) clearTimeout(listenTimer);
                ws.send(JSON.stringify({ type: 'turn', state: 'listening' }));
                console.log('[voice] barge-in');
            };

            const runTurn = async (transcript: string, ws: WSLike) => {
                if (turnActive || !transcript.trim()) return;
                turnActive = true;
                turnAbort = new AbortController();
                const signal = turnAbort.signal;
                tEot = Date.now();
                tFirstText = 0;
                tFirstAudio = 0;
                ttsSeq = 0;
                ttsSamples = 0;
                speakingUntil = 0;
                if (listenTimer) clearTimeout(listenTimer);
                const reqId = `turn-${tEot}`;
                currentReqId = reqId;
                await tts?.beginTurn(reqId);
                ws.send(JSON.stringify({ type: 'turn', state: 'thinking' }));
                console.log('[voice] turn start:', JSON.stringify(transcript));

                try {
                    const content = await runVoiceTurn(
                        transcript,
                        {
                            onText: (chunk) => {
                                if (signal.aborted) return;
                                if (!tFirstText) tFirstText = Date.now();
                                tts?.pushText(reqId, chunk);
                            },
                            onActivity: (activity) =>
                                ws.send(JSON.stringify({ type: 'activity', activity })),
                        },
                        signal,
                    );
                    if (!signal.aborted) tts?.endTurn(reqId);
                    console.log(
                        '[voice] turn done, chars:',
                        content.length,
                        signal.aborted ? '(barged)' : '',
                    );
                } catch (e) {
                    if (!signal.aborted) {
                        console.error('[voice] turn error:', e);
                        ws.send(JSON.stringify({ type: 'error', message: String(e) }));
                    }
                } finally {
                    turnActive = false;
                    turnAbort = null;
                }
            };

            return {
                onOpen(_evt, ws) {
                    flux = new DeepgramFluxSTT({
                        apiKey: process.env.DEEPGRAM_API_KEY,
                        eagerEotThreshold: 0.4,
                    });
                    flux.onSpeechDetected = () => {
                        if (isBusy()) bargeIn(ws);
                        else ws.send(JSON.stringify({ type: 'turn', state: 'listening' }));
                    };
                    flux.onEagerEndOfTurn = (text: string) =>
                        ws.send(JSON.stringify({ type: 'transcript', text, final: false }));
                    flux.onOutput = ({ text }: { text: string }) => {
                        ws.send(JSON.stringify({ type: 'transcript', text, final: true }));
                        void runTurn(text, ws);
                    };

                    tts = makeTTS((pcm, contextId) => {
                        // Route by context: drop audio from a cancelled (barged) turn.
                        if (contextId !== currentReqId || turnAbort?.signal.aborted) return;
                        if (!sidecar || sidecar.readyState !== WebSocket.OPEN) return;
                        if (!tFirstAudio) {
                            tFirstAudio = Date.now();
                            ws.send(JSON.stringify({ type: 'turn', state: 'speaking' }));
                            console.log(
                                `[voice] latency  EOT→text ${tFirstText - tEot}ms  EOT→firstaudio ${tFirstAudio - tEot}ms`,
                            );
                        }
                        sidecar.send(frameTts(peer, ttsSeq++, pcm));

                        // Extend the speaking window by this chunk's real duration so
                        // the turn stays interruptible until playback actually ends.
                        ttsSamples += pcm.length / 2; // 48 kHz mono linear16
                        const playMs = (ttsSamples / 48_000) * 1000;
                        speakingUntil = tFirstAudio + playMs + 400; // pad for jitter buffer
                        if (listenTimer) clearTimeout(listenTimer);
                        listenTimer = setTimeout(
                            () => ws.send(JSON.stringify({ type: 'turn', state: 'listening' })),
                            speakingUntil - Date.now(),
                        );
                    });

                    sidecar = new WebSocket(loadConfig().voice.mediaBridgeUrl);
                    sidecar.binaryType = 'arraybuffer';
                    sidecar.onopen = () => {
                        if (pendingOffer) {
                            sendOpen(pendingOffer);
                            pendingOffer = null;
                        }
                    };
                    sidecar.onmessage = (ev) => {
                        // Binary = mic PCM (12-byte AudioHeader + 48 kHz linear16) -> Flux.
                        if (typeof ev.data !== 'string') {
                            const buf = Buffer.from(ev.data as ArrayBuffer);
                            if (buf.length > 12) flux?.input(buf.subarray(12));
                            return;
                        }
                        try {
                            const msg = JSON.parse(ev.data);
                            if (msg.t === 'peer_answer') {
                                ws.send(JSON.stringify({ type: 'answer', sdp: msg.sdp }));
                            }
                        } catch {
                            /* ignore */
                        }
                    };
                    sidecar.onerror = () =>
                        ws.send(
                            JSON.stringify({ type: 'error', message: 'media sidecar unavailable' }),
                        );
                },
                onMessage(evt) {
                    let msg: { type?: string; sdp?: string };
                    try {
                        msg = JSON.parse(String(evt.data));
                    } catch {
                        return;
                    }
                    if (msg.type === 'offer' && msg.sdp) {
                        if (sidecar?.readyState === WebSocket.OPEN) sendOpen(msg.sdp);
                        else pendingOffer = msg.sdp;
                    }
                },
                onClose() {
                    if (listenTimer) clearTimeout(listenTimer);
                    turnAbort?.abort();
                    try {
                        flux?.kill();
                        tts?.shutdown();
                    } catch {
                        /* ignore */
                    }
                    if (sidecar) {
                        try {
                            sidecar.send(JSON.stringify({ t: 'peer_close', peer }));
                        } catch {
                            /* ignore */
                        }
                        sidecar.close();
                    }
                },
            };
        }),
    );

    return app;
}

/** Minimal shape of the Hono WS context we use. */
interface WSLike {
    send(data: string): void;
}
