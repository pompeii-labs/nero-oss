<script lang="ts">
    import { getServerUrl } from '$lib/actions/helpers';

    // A live browser Nero opened, streamed in as JPEG frames over a WebSocket. We
    // map the user's clicks/scroll/typing back into the real page's coordinates.
    let { session, url }: { session: string; url?: string } = $props();

    const NAT_W = 1280;
    const NAT_H = 800;

    let ws: WebSocket | null = null;
    let frame = $state('');
    let natW = NAT_W;
    let natH = NAT_H;
    let gone = $state(false);
    let host = $state<HTMLDivElement>();
    let addr = $state(url ?? '');

    function send(o: object) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o));
    }

    $effect(() => {
        const base = getServerUrl()
            .replace(/\/$/, '')
            .replace(/^http/, 'ws');
        const sock = new WebSocket(`${base}/v1/browser?session=${encodeURIComponent(session)}`);
        ws = sock;
        sock.onmessage = (e) => {
            const m = JSON.parse(e.data as string);
            if (m.type === 'frame') frame = 'data:image/jpeg;base64,' + m.data;
            else if (m.type === 'meta') {
                natW = m.w;
                natH = m.h;
            } else if (m.type === 'gone') gone = true;
        };
        return () => sock.close();
    });

    // Wheel must be a non-passive listener to preventDefault page scroll.
    $effect(() => {
        const el = host;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const p = toView(e);
            send({ type: 'scroll', x: p.x, y: p.y, dy: e.deltaY });
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    });

    function toView(e: MouseEvent): { x: number; y: number } {
        const r = host!.getBoundingClientRect();
        return {
            x: Math.round(((e.clientX - r.left) / r.width) * natW),
            y: Math.round(((e.clientY - r.top) / r.height) * natH),
        };
    }
    function onClick(e: MouseEvent) {
        send({ type: 'click', ...toView(e) });
        host?.focus();
    }
    function onKey(e: KeyboardEvent) {
        if (e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Tab') {
            e.preventDefault();
            send({ type: 'key', key: e.key });
        } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            send({ type: 'type', text: e.key });
        }
    }
    function go() {
        if (/^https?:\/\//i.test(addr)) send({ type: 'nav', url: addr });
        else if (addr.trim()) send({ type: 'nav', url: `https://${addr.trim()}` });
    }
</script>

<div class="bv">
    <div class="bv-bar">
        <input
            class="bv-addr"
            bind:value={addr}
            placeholder="https://…"
            onkeydown={(e) => e.key === 'Enter' && go()}
            spellcheck="false"
        />
    </div>
    {#if gone}
        <div class="bv-gone">Browser session ended — ask Nero to reopen it.</div>
    {:else}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
            class="bv-view"
            bind:this={host}
            tabindex="0"
            role="application"
            aria-label="Browser"
            onclick={onClick}
            onkeydown={onKey}
        >
            {#if frame}
                <img src={frame} alt="" draggable="false" />
            {:else}
                <div class="bv-loading">loading…</div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .bv {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .bv-bar {
        display: flex;
    }
    .bv-addr {
        flex: 1;
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--text-dim);
        background: rgb(var(--holo) / 0.06);
        border: 1px solid rgb(var(--holo) / 0.18);
        border-radius: 7px;
        padding: 6px 10px;
        outline: none;
    }
    .bv-addr:focus {
        border-color: rgb(var(--holo) / 0.45);
        color: var(--text);
    }
    .bv-view {
        position: relative;
        width: 100%;
        aspect-ratio: 1280 / 800;
        border-radius: 8px;
        overflow: hidden;
        background: #000;
        cursor: default;
        outline: none;
    }
    .bv-view img {
        width: 100%;
        height: 100%;
        display: block;
        user-select: none;
        -webkit-user-drag: none;
    }
    .bv-loading,
    .bv-gone {
        display: grid;
        place-items: center;
        width: 100%;
        aspect-ratio: 1280 / 800;
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.08em;
        color: var(--text-faint);
        text-transform: uppercase;
    }
</style>
