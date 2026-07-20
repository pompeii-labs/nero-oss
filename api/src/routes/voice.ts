import { Hono } from 'hono';
import type { UpgradeWebSocket } from 'hono/ws';
import { DeepgramFluxSTT } from '@pompeii-labs/audio/voice';
import { runVoiceTurn } from '../services/voice/turn';
import { StreamingTTS, type VoiceTTS } from '../services/voice/tts';
import { HumeStreamingTTS } from '../services/voice/hume';
import { KokoroStreamingTTS } from '../services/voice/kokoro';
import { Panel } from '../models/panel';
import { formatInteraction } from '../services/panels/interaction';

const TTS_VOICE = process.env.NERO_TTS_VOICE || 'iP95p4xoKVk53GoZ742B'; // ElevenLabs "chris"
const TTS_MODEL = process.env.NERO_TTS_MODEL || 'eleven_flash_v2_5'; // low-latency

// Provider: hume when a Hume key is present (and not forced off), else ElevenLabs.
const TTS_PROVIDER =
    process.env.NERO_TTS_PROVIDER || (process.env.HUME_API_KEY ? 'hume' : 'elevenlabs');

/** Build the per-session streaming TTS for the active provider. */
function makeTTS(onPcm: (pcm: Buffer, contextId: string) => void): VoiceTTS {
    if (TTS_PROVIDER === 'kokoro') {
        return new KokoroStreamingTTS({
            url: process.env.NERO_KOKORO_URL || 'http://localhost:8880',
            voice: process.env.NERO_KOKORO_VOICE || 'am_onyx',
            model: process.env.NERO_KOKORO_MODEL || 'kokoro',
            onPcm,
        });
    }
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

/**
 * The browser's voice session, all over one WebSocket (no WebRTC, no media sidecar):
 *   browser mic (48kHz s16 PCM, binary up) -> Deepgram Flux -> turn -> harness -> TTS
 *   TTS PCM (48kHz s16, binary down) -> browser Web Audio playout.
 * Half-duplex: while Nero speaks we don't transcribe (his voice would echo in). The
 * browser plays the PCM through a Web Audio ring buffer, which is smooth (vs a WebRTC
 * jitter buffer underrunning on bursty TTS).
 */
export function voiceRoutes(upgradeWebSocket: UpgradeWebSocket): Hono {
    const app = new Hono();

    app.get(
        '/v1/voice',
        upgradeWebSocket((c) => {
            // Which device this voice session belongs to, so focus binds to a session
            // and handoff between rooms can tell sockets apart.
            const deviceId = c.req.query('device') ?? null;
            let flux: DeepgramFluxSTT | null = null;
            let tts: VoiceTTS | null = null;

            let turnActive = false;
            let turnAbort: AbortController | null = null;
            let currentReqId = '';
            // latency marks for the current turn
            let tEot = 0;
            let tSetupDone = 0;
            let tFirstText = 0;
            let tFirstAudio = 0;
            // Estimated wall-clock when the buffered TTS finishes playing out. Half-duplex
            // gates the mic through this window so Nero doesn't hear himself.
            let speakingUntil = 0;
            let ttsSamples = 0;
            let listenTimer: ReturnType<typeof setTimeout> | null = null;

            const isBusy = () => turnActive || Date.now() < speakingUntil;

            const runTurn = async (
                transcript: string,
                ws: WSLike,
                turnOpts: { interaction?: boolean } = {},
            ) => {
                if (turnActive || !transcript.trim()) return;
                turnActive = true;
                turnAbort = new AbortController();
                const signal = turnAbort.signal;
                tEot = Date.now();
                tSetupDone = 0;
                tFirstText = 0;
                tFirstAudio = 0;
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
                            onThinking: () => {
                                if (!tSetupDone) tSetupDone = Date.now();
                            },
                            onText: (chunk) => {
                                if (signal.aborted) return;
                                if (!tFirstText) tFirstText = Date.now();
                                tts?.pushText(reqId, chunk);
                            },
                            onActivity: (activity) =>
                                ws.send(JSON.stringify({ type: 'activity', activity })),
                        },
                        signal,
                        { interaction: turnOpts.interaction },
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

            // Barge-in: the user talked over Nero (or while he was thinking). Kill the
            // in-flight turn + TTS, stop gating, and tell the client to flush playout so
            // he goes quiet immediately; the new utterance runs as the next turn.
            const barge = (ws: WSLike) => {
                if (!turnActive && Date.now() >= speakingUntil) return;
                turnAbort?.abort();
                turnActive = false;
                speakingUntil = 0;
                if (listenTimer) {
                    clearTimeout(listenTimer);
                    listenTimer = null;
                }
                ws.send(JSON.stringify({ type: 'turn', state: 'listening' }));
                ws.send(JSON.stringify({ type: 'barge' }));
            };

            return {
                onOpen(_evt, ws) {
                    console.log(`[voice] session open device=${deviceId ?? '(none)'}`);
                    flux = new DeepgramFluxSTT({
                        apiKey: process.env.DEEPGRAM_API_KEY,
                        eagerEotThreshold: 0.4,
                    });
                    flux.onSpeechDetected = () => {
                        // Talking while Nero is thinking or speaking = barge-in. Otherwise
                        // it's the start of a fresh utterance; just flip the UI to listening.
                        if (isBusy()) barge(ws);
                        else ws.send(JSON.stringify({ type: 'turn', state: 'listening' }));
                    };
                    flux.onEagerEndOfTurn = (text: string) => {
                        ws.send(JSON.stringify({ type: 'transcript', text, final: false }));
                    };
                    flux.onOutput = ({ text }: { text: string }) => {
                        ws.send(JSON.stringify({ type: 'transcript', text, final: true }));
                        void runTurn(text, ws);
                    };

                    tts = makeTTS((pcm, contextId) => {
                        if (contextId !== currentReqId || turnAbort?.signal.aborted) return;
                        if (!tFirstAudio) {
                            tFirstAudio = Date.now();
                            ws.send(JSON.stringify({ type: 'turn', state: 'speaking' }));
                            const setup = (tSetupDone || tEot) - tEot;
                            const llm = tFirstText - (tSetupDone || tEot);
                            const ttsMs = tFirstAudio - tFirstText;
                            console.log(
                                `[voice] EOT→audio ${tFirstAudio - tEot}ms = setup ${setup} + llm ${llm} + tts ${ttsMs}`,
                            );
                        }
                        // Stream the raw 48kHz s16 PCM straight to the browser (binary).
                        ws.send(new Uint8Array(pcm));

                        ttsSamples += pcm.length / 2; // 48 kHz mono linear16
                        const playMs = (ttsSamples / 48_000) * 1000;
                        speakingUntil = tFirstAudio + playMs + 400; // pad for the playout buffer
                        if (listenTimer) clearTimeout(listenTimer);
                        listenTimer = setTimeout(
                            () => ws.send(JSON.stringify({ type: 'turn', state: 'listening' })),
                            speakingUntil - Date.now(),
                        );
                    });

                    ws.send(JSON.stringify({ type: 'ready' }));
                },
                onMessage(evt, ws) {
                    // Binary = mic PCM (48 kHz s16). Full-duplex: always feed Flux, even
                    // while Nero speaks, so the user can barge in (AEC on the client keeps
                    // his own voice out of the mic).
                    if (typeof evt.data !== 'string') {
                        flux?.input(Buffer.from(evt.data as ArrayBuffer));
                        return;
                    }
                    let msg: {
                        type?: string;
                        panelId?: string;
                        control?: string;
                        intent?: string;
                        value?: unknown;
                    };
                    try {
                        msg = JSON.parse(evt.data);
                    } catch {
                        return;
                    }
                    if (msg.type === 'barge') {
                        barge(ws);
                        return;
                    }
                    if (msg.type === 'interact' && msg.panelId) {
                        const pid = msg.panelId;
                        const payload = {
                            control: msg.control,
                            intent: msg.intent,
                            value: msg.value,
                        };
                        void (async () => {
                            const panel = await Panel.get(pid);
                            if (panel)
                                void runTurn(formatInteraction(panel, payload), ws, {
                                    interaction: true,
                                });
                        })();
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
                },
            };
        }),
    );

    return app;
}

/** Minimal shape of the Hono WS context we use (control JSON + binary TTS PCM). */
interface WSLike {
    send(data: string | ArrayBuffer | ArrayBufferView): void;
}
