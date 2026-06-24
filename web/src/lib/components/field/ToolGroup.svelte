<script lang="ts">
    import type { ToolActivity } from '$lib/actions/chat';

    let { tools, live = false }: { tools: ToolActivity[]; live?: boolean } = $props();

    let open = $state<Record<string, boolean>>({});
    const toggle = (id: string) => (open = { ...open, [id]: !open[id] });
</script>

<div class="group" class:live>
    {#if tools.length > 1}
        <div class="ghead">{tools.length} steps</div>
    {/if}
    {#each tools as t (t.id)}
        <button type="button" class="trow" onclick={() => t.result && toggle(t.id)}>
            <span class="ind" data-status={t.status}></span>
            <span class="tname">{t.displayName}</span>
            {#if t.result}<span class="caret" class:on={open[t.id]}>›</span>{/if}
        </button>
        {#if t.result && open[t.id]}
            <pre class="tresult">{t.result}</pre>
        {/if}
    {/each}
</div>

<style>
    .group {
        align-self: flex-start;
        width: fit-content;
        min-width: 220px;
        max-width: 100%;
        padding: 6px;
        border-radius: 10px;
        background: rgb(var(--holo) / 0.03);
        border: 1px solid rgb(var(--holo) / 0.1);
    }
    .group.live {
        border-color: rgb(var(--holo) / 0.22);
        background: rgb(var(--holo) / 0.05);
    }
    .ghead {
        padding: 4px 8px 6px;
        font-family: var(--font-mono);
        font-size: 9.5px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--text-faint);
    }
    .trow {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        text-align: left;
        padding: 7px 9px;
        border: none;
        border-radius: 7px;
        background: none;
        cursor: default;
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--text-dim);
    }
    .trow:has(.caret) {
        cursor: pointer;
    }
    .trow:has(.caret):hover {
        background: rgb(var(--holo) / 0.06);
        color: var(--text);
    }
    .ind {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
        background: var(--text-faint);
    }
    .ind[data-status='complete'] {
        background: rgb(var(--holo));
        box-shadow: 0 0 7px 1px rgb(var(--holo) / 0.7);
    }
    .ind[data-status='running'] {
        background: rgb(var(--holo-soft));
        box-shadow: 0 0 8px 1px rgb(var(--holo));
        animation: blink 1.1s ease-in-out infinite;
    }
    .ind[data-status='error'] {
        background: #f87171;
        box-shadow: 0 0 7px 1px rgb(248 113 113 / 0.7);
    }
    @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
    }
    .tname {
        flex: 1;
        letter-spacing: 0.02em;
    }
    .caret {
        color: var(--text-faint);
        transition: transform 0.18s;
    }
    .caret.on {
        transform: rotate(90deg);
    }
    .tresult {
        margin: 0 9px 6px;
        padding: 9px 11px;
        border-radius: 7px;
        background: rgb(0 0 0 / 0.35);
        border: 1px solid rgb(var(--holo) / 0.1);
        font-family: var(--font-mono);
        font-size: 11px;
        line-height: 1.5;
        color: var(--text-dim);
        white-space: pre-wrap;
        max-height: 220px;
        overflow-y: auto;
    }
    @media (prefers-reduced-motion: reduce) {
        .ind[data-status='running'] { animation: none; }
    }
</style>
