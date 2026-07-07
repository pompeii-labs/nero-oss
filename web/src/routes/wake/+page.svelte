<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import type { WakewordListener } from '$lib/wakeword';

    let listener: WakewordListener | null = null;
    let status = $state('loading models…');
    let score = $state(0);
    let peak = $state(0);
    let detections = $state(0);
    let live = $state(false);
    let autotest = $state<string>('');

    function wavToInt16(buf: ArrayBuffer): Int16Array {
        const dv = new DataView(buf);
        let off = 12;
        while (off + 8 <= dv.byteLength) {
            const id = String.fromCharCode(
                dv.getUint8(off),
                dv.getUint8(off + 1),
                dv.getUint8(off + 2),
                dv.getUint8(off + 3),
            );
            const size = dv.getUint32(off + 4, true);
            if (id === 'data') return new Int16Array(buf.slice(off + 8, off + 8 + size));
            off += 8 + size;
        }
        return new Int16Array(0);
    }

    async function runClip(url: string): Promise<number> {
        const { WakewordListener } = await import('$lib/wakeword');
        let max = 0;
        const l = new WakewordListener({
            threshold: 0.5,
            onScore: (s) => {
                score = s;
                if (s > max) max = s;
            },
        });
        await l.load();
        const raw = wavToInt16(await (await fetch(url)).arrayBuffer());
        // Pad with ~1s of silence front + back so the mel/embedding windows fill.
        const pad = 16000;
        const samples = new Int16Array(pad + raw.length + pad);
        samples.set(raw, pad);
        l.feedSamples(samples);
        await new Promise((r) => setTimeout(r, 3000));
        return max;
    }

    async function toggleMic() {
        const { WakewordListener } = await import('$lib/wakeword');
        if (live) {
            listener?.stop();
            live = false;
            status = 'stopped';
            return;
        }
        listener = new WakewordListener({
            threshold: 0.5,
            onScore: (s) => {
                score = s;
                if (s > peak) peak = s;
            },
            onDetect: () => (detections += 1),
        });
        status = 'loading…';
        await listener.load();
        try {
            await listener.start();
            live = true;
            status = 'listening — say "hey jarvis"';
        } catch (e) {
            status = 'error: ' + (e as Error).message;
        }
    }

    onMount(async () => {
        const params = new URLSearchParams(location.search);
        if (params.has('autotest')) {
            status = 'running autotest…';
            const hn = await runClip('/wakeword/test-heynero.wav');
            const neg = await runClip('/wakeword/test-negative.wav');
            autotest = `heynero=${hn.toFixed(3)} negative=${neg.toFixed(3)} ${hn > 0.5 && hn > neg ? 'PASS' : 'FAIL'}`;
            status = 'autotest done';
            (window as unknown as { __wakeResult: string }).__wakeResult = autotest;
        } else {
            status = 'ready — tap to listen';
        }
    });

    onDestroy(() => listener?.stop());
</script>

<div class="wake">
    <h1>wakeword debug</h1>
    <p class="status">{status}</p>

    {#if autotest}
        <p class="autotest" data-result={autotest}>{autotest}</p>
    {/if}

    <div class="meter">
        <div class="fill" style="width:{Math.min(100, score * 100)}%"></div>
        <div class="thresh"></div>
    </div>
    <div class="nums">
        <span>score {score.toFixed(3)}</span>
        <span>peak {peak.toFixed(3)}</span>
        <span>detections {detections}</span>
    </div>

    <button onclick={toggleMic}>{live ? 'stop' : 'start mic'}</button>
</div>

<style>
    .wake {
        max-width: 480px;
        margin: 4rem auto;
        padding: 2rem;
        font-family:
            ui-monospace,
            SFMono-Regular,
            monospace;
        color: #cfe;
    }
    h1 {
        font-size: 1.1rem;
        opacity: 0.7;
    }
    .status {
        opacity: 0.6;
    }
    .autotest {
        font-weight: 700;
        color: #7fffd4;
    }
    .meter {
        position: relative;
        height: 22px;
        background: #0b1220;
        border-radius: 6px;
        overflow: hidden;
        margin: 1rem 0 0.5rem;
    }
    .fill {
        height: 100%;
        background: linear-gradient(90deg, #2a6, #7fffd4);
        transition: width 0.05s linear;
    }
    .thresh {
        position: absolute;
        top: 0;
        left: 50%;
        width: 2px;
        height: 100%;
        background: #f66;
    }
    .nums {
        display: flex;
        gap: 1rem;
        font-size: 0.85rem;
        opacity: 0.75;
    }
    button {
        margin-top: 1.5rem;
        padding: 0.6rem 1.2rem;
        background: #163;
        color: #cfe;
        border: 1px solid #2a6;
        border-radius: 8px;
        cursor: pointer;
    }
</style>
