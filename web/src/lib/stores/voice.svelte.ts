import { AudioRecorder, AudioPlayer } from '$lib/audio';
import { bufferToInt16Array, int16ArrayToBuffer } from '@pompeii-labs/audio';
import { Buffer } from 'buffer';
import { getServerUrl } from '$lib/actions/helpers';
import type { ToolActivity } from '$lib/actions/chat';

export type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'error';

function createVoiceStore() {
    let status = $state<VoiceStatus>('idle');
    let isMuted = $state(false);
    let isTalking = $state(false);
    let rmsLevel = $state(0);
    let transcript = $state('');
    let activities = $state<ToolActivity[]>([]);
    let errorMessage = $state<string | null>(null);

    let ws: WebSocket | null = null;
    let recorder: AudioRecorder | null = null;
    let player: AudioPlayer | null = null;

    async function connect() {
        if (ws) return;

        status = 'connecting';
        errorMessage = null;

        try {
            player = new AudioPlayer();
            await player.connect(() => {
                isTalking = false;
            });

            recorder = new AudioRecorder();

            const baseUrl = getServerUrl('/webhook/voice/stream');
            const wsUrl = baseUrl.replace(/^http/, 'ws');

            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                status = 'connected';
                ws?.send(JSON.stringify({ type: 'medium', data: { medium: 'web-voice' } }));
                startRecording();
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);

                if (data.type === 'audio') {
                    const pcm = Buffer.from(data.data.audio, 'base64');
                    player?.play(bufferToInt16Array(pcm));
                    isTalking = true;
                } else if (data.type === 'clear') {
                    player?.clear();
                    isTalking = false;
                } else if (data.type === 'transcript') {
                    activities = [];
                    transcript = data.data.text || '';
                } else if (data.type === 'activity') {
                    const existing = activities.findIndex((a) => a.tool === data.data.tool);
                    if (existing >= 0) {
                        activities = [
                            ...activities.slice(0, existing),
                            data.data,
                            ...activities.slice(existing + 1),
                        ];
                    } else {
                        activities = [...activities, data.data];
                    }
                }
            };

            ws.onerror = () => {
                errorMessage = 'Connection failed';
                status = 'error';
            };

            ws.onclose = () => {
                disconnect();
            };
        } catch (err) {
            errorMessage = err instanceof Error ? err.message : 'Failed to connect';
            status = 'error';
        }
    }

    async function startRecording() {
        if (!recorder) return;

        await recorder.start((audioData, rms) => {
            rmsLevel = rms;

            if (ws?.readyState !== WebSocket.OPEN) return;

            const float32 = new Float32Array(audioData);
            const buffer = new ArrayBuffer(float32.length * 2);
            const view = new DataView(buffer);

            for (let i = 0; i < float32.length; i++) {
                const s = Math.max(-1, Math.min(1, float32[i]));
                view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
            }

            const pcm = new Int16Array(buffer);
            const encoded = int16ArrayToBuffer(pcm);

            ws.send(
                JSON.stringify({
                    type: 'audio',
                    data: { audio: encoded.toString('base64') },
                }),
            );
        });
    }

    function disconnect() {
        recorder?.stop();
        player?.disconnect();
        ws?.close();

        recorder = null;
        player = null;
        ws = null;

        status = 'idle';
        isMuted = false;
        isTalking = false;
        rmsLevel = 0;
        transcript = '';
        activities = [];
    }

    function toggleMute() {
        if (!recorder) return;

        if (recorder.isMuted) {
            recorder.unmute();
            isMuted = false;
        } else {
            recorder.mute();
            isMuted = true;
        }
    }

    function clearActivities() {
        activities = [];
    }

    return {
        get status() {
            return status;
        },
        get isMuted() {
            return isMuted;
        },
        get isTalking() {
            return isTalking;
        },
        get rmsLevel() {
            return rmsLevel;
        },
        get transcript() {
            return transcript;
        },
        get activities() {
            return activities;
        },
        get errorMessage() {
            return errorMessage;
        },
        get isConnected() {
            return status === 'connected';
        },
        connect,
        disconnect,
        toggleMute,
        clearActivities,
    };
}

export const voice = createVoiceStore();
