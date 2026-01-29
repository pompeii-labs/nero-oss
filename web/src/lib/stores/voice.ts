import { writable, derived } from 'svelte/store';
import { AudioRecorder, AudioPlayer } from '$lib/audio';
import { bufferToInt16Array, int16ArrayToBuffer } from '@pompeii-labs/audio';
import { Buffer } from 'buffer';
import { getServerUrl } from '$lib/actions/helpers';
import type { ToolActivity } from '$lib/actions/chat';

export type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'error';

function createVoiceStore() {
    const status = writable<VoiceStatus>('idle');
    const isMuted = writable(false);
    const isTalking = writable(false);
    const rmsLevel = writable(0);
    const transcript = writable('');
    const activities = writable<ToolActivity[]>([]);
    const errorMessage = writable<string | null>(null);

    let ws: WebSocket | null = null;
    let recorder: AudioRecorder | null = null;
    let player: AudioPlayer | null = null;

    async function connect() {
        if (ws) return;

        status.set('connecting');
        errorMessage.set(null);

        try {
            player = new AudioPlayer();
            await player.connect(() => {
                isTalking.set(false);
            });

            recorder = new AudioRecorder();

            const baseUrl = getServerUrl('/webhook/voice/stream');
            const wsUrl = baseUrl.replace(/^http/, 'ws');

            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                status.set('connected');
                ws?.send(JSON.stringify({ type: 'medium', data: { medium: 'web-voice' } }));
                startRecording();
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);

                if (data.type === 'audio') {
                    const pcm = Buffer.from(data.data.audio, 'base64');
                    player?.play(bufferToInt16Array(pcm));
                    isTalking.set(true);
                } else if (data.type === 'clear') {
                    player?.clear();
                    isTalking.set(false);
                } else if (data.type === 'transcript') {
                    activities.set([]);
                    transcript.set(data.data.text || '');
                } else if (data.type === 'activity') {
                    activities.update((list) => {
                        const existing = list.findIndex((a) => a.tool === data.data.tool);
                        if (existing >= 0) {
                            list[existing] = data.data;
                            return [...list];
                        }
                        return [...list, data.data];
                    });
                }
            };

            ws.onerror = () => {
                errorMessage.set('Connection failed');
                status.set('error');
            };

            ws.onclose = () => {
                disconnect();
            };
        } catch (err) {
            errorMessage.set(err instanceof Error ? err.message : 'Failed to connect');
            status.set('error');
        }
    }

    async function startRecording() {
        if (!recorder) return;

        await recorder.start((audioData, rms) => {
            rmsLevel.set(rms);

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

        status.set('idle');
        isMuted.set(false);
        isTalking.set(false);
        rmsLevel.set(0);
        transcript.set('');
        activities.set([]);
    }

    function toggleMute() {
        if (!recorder) return;

        if (recorder.isMuted) {
            recorder.unmute();
            isMuted.set(false);
        } else {
            recorder.mute();
            isMuted.set(true);
        }
    }

    function clearActivities() {
        activities.set([]);
    }

    return {
        status,
        isMuted,
        isTalking,
        rmsLevel,
        transcript,
        activities,
        errorMessage,
        isConnected: derived(status, ($s) => $s === 'connected'),
        connect,
        disconnect,
        toggleMute,
        clearActivities,
    };
}

export const voice = createVoiceStore();
