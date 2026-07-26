<script lang="ts">
    // A real camera for the dial's CAMERA slot. On a phone the native file-capture
    // sheet is the better camera UI, so this is only used where `capture` is ignored
    // (desktop browsers), where it would otherwise silently open a file dialog.
    let {
        open = false,
        onCapture,
        onClose,
    }: {
        open?: boolean;
        onCapture: (file: File) => void;
        onClose: () => void;
    } = $props();

    let video = $state<HTMLVideoElement | null>(null);
    let stream: MediaStream | null = null;
    let error = $state('');

    async function start() {
        error = '';
        if (!navigator.mediaDevices?.getUserMedia) {
            error = 'no camera on this device';
            return;
        }
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 } },
                audio: false,
            });
            if (video) {
                video.srcObject = stream;
                await video.play().catch(() => {});
            }
        } catch {
            error = 'camera permission denied';
        }
    }

    function stop() {
        stream?.getTracks().forEach((t) => t.stop());
        stream = null;
    }

    function shoot() {
        if (!video || !video.videoWidth) return;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0);
        canvas.toBlob(
            (blob) => {
                if (blob) onCapture(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
                onClose();
            },
            'image/jpeg',
            0.85,
        );
    }

    $effect(() => {
        if (open) void start();
        else stop();
        return stop;
    });

    $effect(() => {
        if (!open) return;
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });
</script>

{#if open}
    <div class="scrim" role="presentation" onclick={onClose}></div>
    <div class="cam glass">
        {#if error}
            <p class="err">{error}</p>
            <button class="shutter cancel" onclick={onClose}>close</button>
        {:else}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video bind:this={video} playsinline muted></video>
            <div class="row">
                <button class="shutter" onclick={shoot} aria-label="Take photo"></button>
            </div>
        {/if}
    </div>
{/if}

<style>
    .scrim {
        position: fixed;
        inset: 0;
        z-index: 60;
        background: rgb(0 0 0 / 0.5);
        backdrop-filter: blur(2px);
    }
    .cam {
        position: fixed;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        z-index: 61;
        width: min(560px, 92vw);
        padding: 14px;
        border-radius: 22px;
        display: grid;
        gap: 12px;
        animation: cam-in 0.24s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes cam-in {
        from { opacity: 0; transform: translate(-50%, -50%) scale(0.94); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }
    video {
        width: 100%;
        border-radius: 14px;
        background: #000;
        display: block;
    }
    .row {
        display: flex;
        justify-content: center;
    }
    .shutter {
        width: 58px;
        height: 58px;
        border-radius: 50%;
        border: 3px solid rgb(var(--holo) / 0.6);
        background: rgb(var(--holo-soft) / 0.9);
        cursor: pointer;
        box-shadow: 0 0 24px -4px rgb(var(--holo) / 0.7);
        transition: transform 0.12s;
    }
    .shutter:active {
        transform: scale(0.92);
    }
    .shutter.cancel {
        width: auto;
        height: auto;
        border-radius: 999px;
        padding: 8px 18px;
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--text);
        background: rgb(var(--holo) / 0.12);
        box-shadow: none;
    }
    .err {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--text-dim);
        text-align: center;
        margin: 10px 0;
    }
</style>
