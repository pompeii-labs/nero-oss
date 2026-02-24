import { AudioRecorder, AudioPlayer } from '$lib/audio';
import { bufferToInt16Array, int16ArrayToBuffer } from '@pompeii-labs/audio';
import { Buffer } from 'buffer';
import { getServerUrl, get, post } from '$lib/actions/helpers';
import type { ToolActivity } from '$lib/actions/chat';
import { interfaces } from '$lib/stores/interfaces.svelte';

export type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'error';

function createVoiceStore() {
    let status = $state<VoiceStatus>('idle');
    let isMuted = $state(false);
    let isTalking = $state(false);
    let isProcessing = $state(false);
    let rmsLevel = $state(0);
    let outputRms = $state(0);
    let transcript = $state('');
    let activities = $state<ToolActivity[]>([]);
    let errorMessage = $state<string | null>(null);
    let migrating = $state<'departing' | 'arriving' | null>(null);
    let audioSuspended = $state(false);
    let migratedTo = $state<string | null>(null);
    let neroDisplay = $state('main');

    let ws: WebSocket | null = null;
    let recorder: AudioRecorder | null = null;
    let player: AudioPlayer | null = null;

    async function connect() {
        if (ws) return;

        status = 'connecting';
        errorMessage = null;
        migratedTo = null;

        try {
            const baseUrl = getServerUrl('/webhook/voice/stream');
            const wsUrl = baseUrl.replace(/^http/, 'ws');

            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                status = 'connected';
                ws?.send(JSON.stringify({ type: 'medium', data: { medium: 'web-voice' } }));
                initAudio();
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);

                if (data.type === 'audio') {
                    const pcm = Buffer.from(data.data.audio, 'base64');
                    const int16 = bufferToInt16Array(pcm);

                    let sum = 0;
                    for (let i = 0; i < int16.length; i++) {
                        const s = int16[i] / 0x8000;
                        sum += s * s;
                    }
                    outputRms = Math.sqrt(sum / int16.length);

                    player?.play(int16);
                    isTalking = true;
                    isProcessing = false;
                } else if (data.type === 'clear') {
                    player?.clear();
                    isTalking = false;
                    outputRms = 0;
                } else if (data.type === 'transcript') {
                    activities = [];
                    transcript = data.data.text || '';
                    isProcessing = true;
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

    async function initAudio() {
        player = new AudioPlayer();
        await player.connect(() => {
            isTalking = false;
        });

        try {
            recorder = new AudioRecorder();
            await startRecording();
        } catch {
            recorder = null;
        }

        if (player.suspended) {
            audioSuspended = true;
            await player.tryResume();
            audioSuspended = player.suspended;
        }
    }

    async function resumeAudio() {
        const playerResume = player?.tryResume();

        let recorderStart: Promise<void> | null = null;
        if (!recorder) {
            try {
                recorder = new AudioRecorder();
                recorderStart = startRecording();
            } catch {
                recorder = null;
            }
        }

        if (playerResume) {
            await playerResume;
            audioSuspended = player!.suspended;
        }

        if (recorderStart) {
            try {
                await recorderStart;
            } catch {
                recorder = null;
            }
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
        isProcessing = false;
        rmsLevel = 0;
        outputRms = 0;
        transcript = '';
        activities = [];
        audioSuspended = false;
        migratedTo = null;
        interfaces.closeAll();
    }

    function migrateAway(targetDevice?: string) {
        migrating = 'departing';
        migratedTo = targetDevice || 'another display';

        setTimeout(() => {
            recorder?.stop();
            player?.disconnect();
            ws?.close();

            recorder = null;
            player = null;
            ws = null;

            status = 'idle';
            isMuted = false;
            isTalking = false;
            isProcessing = false;
            rmsLevel = 0;
            outputRms = 0;
            transcript = '';
            activities = [];
            audioSuspended = false;
            migrating = null;
        }, 600);
    }

    function connectAsTarget() {
        migrating = 'arriving';
        connect();
        setTimeout(() => {
            migrating = null;
        }, 700);
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

    function setNeroDisplay(display: string) {
        neroDisplay = display;
    }

    async function fetchPresence() {
        const res = await get<{ display: string }>('/api/presence');
        if (res.success) {
            neroDisplay = res.data.display;
        }
    }

    async function nudge(display: string) {
        const res = await post<{ display: string }>('/api/presence', { display });
        if (res.success) {
            neroDisplay = res.data.display;
        }
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
        get isProcessing() {
            return isProcessing;
        },
        get rmsLevel() {
            return rmsLevel;
        },
        get outputRms() {
            return outputRms;
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
        get migrating() {
            return migrating;
        },
        get audioSuspended() {
            return audioSuspended;
        },
        get migratedTo() {
            return migratedTo;
        },
        get neroDisplay() {
            return neroDisplay;
        },
        connect,
        connectAsTarget,
        disconnect,
        migrateAway,
        toggleMute,
        clearActivities,
        resumeAudio,
        setNeroDisplay,
        fetchPresence,
        nudge,
    };
}

export const voice = createVoiceStore();
