<script lang="ts">
    // A YouTube embed Nero can throw up and drive. The user gets native controls
    // (play/pause/seek/fullscreen) for free. Nero controls it by patching a bound
    // `cmd` in panel state; we drive the real YouTube IFrame Player API so commands
    // are reliable (queued until the player is ready) instead of best-effort
    // postMessage. cmd = { do: 'play'|'pause'|'seek'|'mute'|'unmute', to?: seconds }.
    let {
        videoId,
        start = 0,
        autoplay = true,
        cmd,
    }: {
        videoId: string;
        start?: number;
        autoplay?: boolean;
        cmd?: { do?: string; to?: number } | null;
    } = $props();

    let host: HTMLDivElement | undefined = $state();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let player: any = null;
    let ready = false;
    let lastApplied = '';
    let pending: { do?: string; to?: number } | null = null;

    function loadApi(): Promise<unknown> {
        const w = window as unknown as {
            YT?: { Player: unknown };
            onYouTubeIframeAPIReady?: () => void;
        };
        if (w.YT && w.YT.Player) return Promise.resolve(w.YT);
        return new Promise((resolve) => {
            const prev = w.onYouTubeIframeAPIReady;
            w.onYouTubeIframeAPIReady = () => {
                prev?.();
                resolve(w.YT);
            };
            if (!document.getElementById('yt-iframe-api')) {
                const s = document.createElement('script');
                s.id = 'yt-iframe-api';
                s.src = 'https://www.youtube.com/iframe_api';
                document.head.appendChild(s);
            }
        });
    }

    function apply(c: { do?: string; to?: number }) {
        if (!player) return;
        switch (c.do) {
            case 'play':
                player.playVideo?.();
                break;
            case 'pause':
                player.pauseVideo?.();
                break;
            case 'seek':
                player.seekTo?.(c.to ?? 0, true);
                break;
            case 'mute':
                player.mute?.();
                break;
            case 'unmute':
                player.unMute?.();
                break;
        }
    }

    // Build (and rebuild on videoId change) the player.
    $effect(() => {
        const vid = videoId;
        let cancelled = false;
        ready = false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        loadApi().then((YT: any) => {
            if (cancelled || !host || !YT) return;
            player = new YT.Player(host, {
                videoId: vid,
                playerVars: {
                    autoplay: autoplay ? 1 : 0,
                    rel: 0,
                    playsinline: 1,
                    start: Math.round(start),
                },
                events: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    onReady: (e: any) => {
                        ready = true;
                        if (autoplay) e.target.playVideo?.();
                        if (pending) {
                            apply(pending);
                            pending = null;
                        }
                    },
                },
            });
        });
        return () => {
            cancelled = true;
            try {
                player?.destroy?.();
            } catch {
                /* ignore */
            }
            player = null;
            ready = false;
        };
    });

    // Apply a control command when its CONTENT changes (so unrelated state updates
    // don't re-trigger the video). Queue it if the player isn't ready yet.
    $effect(() => {
        const key = JSON.stringify(cmd ?? null);
        if (!cmd || key === lastApplied) return;
        lastApplied = key;
        if (ready && player) apply(cmd);
        else pending = cmd;
    });
</script>

<div class="yt">
    <div bind:this={host}></div>
</div>

<style>
    .yt {
        width: 100%;
        aspect-ratio: 16 / 9;
        border-radius: 8px;
        overflow: hidden;
        background: #000;
    }
    .yt :global(iframe) {
        width: 100%;
        height: 100%;
        display: block;
        border: 0;
    }
</style>
