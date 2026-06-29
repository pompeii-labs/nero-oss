<script lang="ts">
    import { resolve, type Comp, type PanelAction } from '$lib/panels/types';
    import Self from './PanelComponent.svelte';
    import YouTubePlayer from './YouTubePlayer.svelte';
    import ChartPanel from './ChartPanel.svelte';
    import BrowserView from './BrowserView.svelte';

    let {
        node,
        onAction,
        state,
    }: {
        node: Comp;
        onAction: (a: PanelAction, control: string) => void;
        state: Record<string, unknown>;
    } = $props();
    const s = (v: unknown) => String(resolve(v as never, state) ?? '');
    const n = (v: unknown) => Number(resolve(v as never, state) ?? 0);
</script>

{#if node.type === 'text'}
    <p class="pc-text {node.variant ?? 'body'}">{s(node.text)}</p>
{:else if node.type === 'button'}
    <button
        class="pc-btn {node.variant ?? 'default'}"
        onclick={() => node.action && onAction(node.action, node.label)}
    >
        {node.label}
    </button>
{:else if node.type === 'image'}
    <img
        class="pc-img"
        src={s(node.src)}
        alt={node.alt ?? ''}
        style="object-fit:{node.fit ?? 'cover'};{node.height ? `height:${node.height}px;` : ''}"
    />
{:else if node.type === 'youtube'}
    <YouTubePlayer
        videoId={s(node.videoId)}
        start={node.start}
        autoplay={node.autoplay ?? true}
        cmd={resolve(node.cmd ?? { bind: 'yt' }, state) as unknown as {
            do?: string;
            to?: number;
        } | null}
    />
{:else if node.type === 'browser'}
    <BrowserView session={node.session} url={node.url} />
{:else if node.type === 'chart'}
    <ChartPanel
        data={resolve(node.data as never, state)}
        value={node.value !== undefined ? resolve(node.value as never, state) : undefined}
        window={node.window}
        sampleMs={node.sampleMs}
        kind={node.kind}
        height={node.height}
        min={node.min}
        max={node.max}
    />
{:else if node.type === 'metric'}
    <div class="pc-metric">
        <span class="pc-mlabel">{s(node.label)}</span>
        <span class="pc-mvalue">{s(node.value)}</span>
        {#if node.sub}<span class="pc-msub">{s(node.sub)}</span>{/if}
    </div>
{:else if node.type === 'progress'}
    <div class="pc-prog">
        {#if node.label}<span class="pc-plabel">{s(node.label)}</span>{/if}
        <div class="pc-ptrack">
            <div
                class="pc-pfill"
                style="width:{Math.max(0, Math.min(100, (n(node.value) / (node.max ?? 100)) * 100))}%"
            ></div>
        </div>
    </div>
{:else if node.type === 'list'}
    {@const items = (resolve(node.items as never, state) ?? []) as string[]}
    {#if node.ordered}
        <ol class="pc-list">{#each items as it}<li>{it}</li>{/each}</ol>
    {:else}
        <ul class="pc-list">{#each items as it}<li>{it}</li>{/each}</ul>
    {/if}
{:else if node.type === 'badge'}
    <span class="pc-badge {node.tone ?? 'info'}">{s(node.text)}</span>
{:else if node.type === 'divider'}
    <hr class="pc-divider" />
{:else if node.type === 'row'}
    <div class="pc-row" style="gap:{node.gap ?? 10}px; align-items:{node.align ?? 'center'};">
        {#each node.children as c}<Self node={c} {onAction} {state} />{/each}
    </div>
{:else if node.type === 'stack'}
    <div class="pc-stack" style="gap:{node.gap ?? 10}px;">
        {#each node.children as c}<Self node={c} {onAction} {state} />{/each}
    </div>
{/if}

<style>
    .pc-text {
        margin: 0;
        color: var(--text);
        line-height: 1.5;
    }
    .pc-text.title {
        font-family: var(--font-display);
        font-size: 20px;
        font-weight: 600;
    }
    .pc-text.heading {
        font-size: 14px;
        font-weight: 600;
        letter-spacing: 0.01em;
    }
    .pc-text.body {
        font-size: 13.5px;
        color: var(--text-dim);
    }
    .pc-text.caption {
        font-size: 11px;
        color: var(--text-faint);
        font-family: var(--font-mono);
        letter-spacing: 0.04em;
    }
    .pc-text.mono {
        font-family: var(--font-mono);
        font-size: 12px;
        white-space: pre-wrap;
        color: var(--text-dim);
    }

    .pc-btn {
        font-family: var(--font-mono);
        font-size: 12px;
        letter-spacing: 0.04em;
        padding: 7px 13px;
        border-radius: 8px;
        border: 1px solid rgb(var(--holo) / 0.28);
        background: rgb(var(--holo) / 0.06);
        color: var(--text);
        cursor: pointer;
        transition:
            background 0.15s ease,
            border-color 0.15s ease;
    }
    .pc-btn:hover {
        background: rgb(var(--holo) / 0.14);
        border-color: rgb(var(--holo) / 0.5);
    }
    .pc-btn.primary {
        background: rgb(var(--holo) / 0.18);
        border-color: rgb(var(--holo) / 0.55);
        color: var(--text);
    }
    .pc-btn.ghost {
        background: none;
        border-color: rgb(var(--holo) / 0.16);
        color: var(--text-dim);
    }
    .pc-btn.danger {
        border-color: rgb(220 90 90 / 0.5);
        background: rgb(220 90 90 / 0.1);
        color: rgb(235 150 150);
    }

    .pc-img {
        width: 100%;
        border-radius: 8px;
        display: block;
    }

    .pc-metric {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .pc-mlabel {
        font-family: var(--font-mono);
        font-size: 9.5px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--text-faint);
    }
    .pc-mvalue {
        font-family: var(--font-display);
        font-size: 26px;
        font-weight: 600;
        color: var(--text);
        line-height: 1.1;
    }
    .pc-msub {
        font-size: 11px;
        color: var(--text-dim);
    }

    .pc-prog {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }
    .pc-plabel {
        font-size: 11px;
        color: var(--text-dim);
    }
    .pc-ptrack {
        height: 6px;
        border-radius: 3px;
        background: rgb(var(--holo) / 0.1);
        overflow: hidden;
    }
    .pc-pfill {
        height: 100%;
        background: rgb(var(--holo) / 0.6);
        border-radius: 3px;
        transition: width 0.4s ease;
    }

    .pc-list {
        margin: 0;
        padding-left: 18px;
        color: var(--text-dim);
        font-size: 13px;
        line-height: 1.6;
    }

    .pc-badge {
        display: inline-block;
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid currentColor;
    }
    .pc-badge.info {
        color: rgb(var(--holo-soft));
    }
    .pc-badge.good {
        color: rgb(120 210 150);
    }
    .pc-badge.warn {
        color: rgb(230 190 110);
    }
    .pc-badge.bad {
        color: rgb(235 130 130);
    }

    .pc-divider {
        border: none;
        border-top: 1px solid rgb(var(--holo) / 0.14);
        margin: 2px 0;
    }

    .pc-row {
        display: flex;
        flex-wrap: wrap;
    }
    .pc-stack {
        display: flex;
        flex-direction: column;
    }
</style>
