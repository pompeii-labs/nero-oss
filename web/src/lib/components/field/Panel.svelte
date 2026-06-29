<script lang="ts">
    // A floating holographic panel: brushed-metal frame, corner-bracket
    // reticles, a mono header label, and a body slot. The chrome Nero's
    // generative panels live inside.
    import type { Snippet } from 'svelte';

    let {
        label,
        meta,
        width,
        rotate = 0,
        children,
    }: {
        label?: string;
        meta?: string;
        width?: number;
        rotate?: number;
        children: Snippet;
    } = $props();
</script>

<section
    class="panel"
    style="{width ? `width:${width}px;` : ''}{rotate ? `transform:rotate(${rotate}deg);` : ''}"
>
    <span class="cnr tl"></span><span class="cnr tr"></span>
    <span class="cnr bl"></span><span class="cnr br"></span>

    {#if label}
        <header class="phead">
            <i class="pdot"></i>
            <span class="plabel">{label}</span>
            {#if meta}<span class="pmeta">{meta}</span>{/if}
        </header>
    {/if}

    <div class="pbody">
        {@render children()}
    </div>
</section>

<style>
    .panel {
        position: relative;
        padding: 16px 18px 18px;
        border-radius: 8px;
        background: var(--panel-bg);
        border: 1px solid rgb(var(--holo) / 0.16);
        backdrop-filter: blur(10px) saturate(1.15);
        box-shadow:
            inset 0 1px 0 rgb(var(--metal-hi) / 0.16),
            inset 0 0 30px rgb(var(--holo) / 0.04),
            0 0 0 1px rgb(var(--holo) / 0.05),
            0 28px 60px -24px rgb(0 0 0 / 0.85),
            0 0 40px -16px rgb(var(--holo) / 0.28);
    }

    .cnr {
        position: absolute;
        width: 11px;
        height: 11px;
        border: 1px solid rgb(var(--holo-soft));
        opacity: 0.8;
        pointer-events: none;
    }
    .tl { top: -1px; left: -1px; border-right: 0; border-bottom: 0; }
    .tr { top: -1px; right: -1px; border-left: 0; border-bottom: 0; }
    .bl { bottom: -1px; left: -1px; border-right: 0; border-top: 0; }
    .br { bottom: -1px; right: -1px; border-left: 0; border-top: 0; }

    .phead {
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: rgb(var(--holo-soft) / 0.85);
        padding-bottom: 11px;
        margin-bottom: 12px;
        border-bottom: 1px solid rgb(var(--holo) / 0.14);
    }
    .pdot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: rgb(var(--holo));
        box-shadow: 0 0 7px 1px rgb(var(--holo));
    }
    .pmeta {
        margin-left: auto;
        letter-spacing: 0.1em;
        color: var(--text-faint);
    }
    .pbody {
        color: var(--text);
    }
</style>
