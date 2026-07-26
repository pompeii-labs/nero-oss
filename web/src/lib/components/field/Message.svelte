<script lang="ts">
    import { marked } from 'marked';

    type FileRef = {
        id: string;
        originalName: string;
        mimeType: string;
        size: number;
        previewUrl?: string;
    };

    let {
        role,
        content,
        attachments,
    }: {
        role: 'user' | 'assistant' | 'system';
        content: string;
        attachments?: FileRef[] | null;
    } = $props();

    marked.setOptions({ breaks: true, gfm: true });
    const html = $derived(marked.parse(content ?? '') as string);
    const images = $derived((attachments ?? []).filter((a) => a.mimeType.startsWith('image/')));
    const files = $derived((attachments ?? []).filter((a) => !a.mimeType.startsWith('image/')));
    const imgUrl = (a: FileRef) => a.previewUrl ?? `/v1/files/${a.id}`;
</script>

{#if role === 'user'}
    <div class="row user">
        <div class="bubble">
            {#if content}<p class="utext">{content}</p>{/if}
            {#if images.length}
                <div class="imgs">
                    {#each images as a}<img src={imgUrl(a)} alt={a.originalName} loading="lazy" />{/each}
                </div>
            {/if}
            {#if files.length}
                <div class="files">
                    {#each files as a}<span class="file">{a.originalName}</span>{/each}
                </div>
            {/if}
        </div>
    </div>
{:else if role === 'system'}
    <div class="row system">
        <pre>{content}</pre>
    </div>
{:else}
    <div class="row nero">
        <div class="prose">{@html html}</div>
    </div>
{/if}

<style>
    .row {
        display: flex;
        width: 100%;
    }
    .user {
        justify-content: flex-end;
    }
    .nero,
    .system {
        justify-content: flex-start;
    }

    /* the glass recipe carries the material; the holo wash on top keeps the user's
       side reading as theirs */
    .bubble {
        max-width: 78%;
        padding: 11px 15px;
        border-radius: 18px 18px 5px 18px;
        background:
            linear-gradient(180deg, rgb(var(--holo) / 0.16), rgb(var(--holo) / 0.06)),
            var(--glass-tint);
        backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
        -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
        border: 1px solid var(--glass-edge);
        box-shadow:
            inset 0 1px 0 var(--glass-hi),
            inset 0 -1px 0 var(--glass-shade),
            0 14px 34px -20px rgb(0 0 0 / 0.85);
    }
    .utext {
        margin: 0;
        font-size: 14.5px;
        line-height: 1.5;
        color: var(--text);
        white-space: pre-wrap;
    }
    .imgs {
        margin-top: 8px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }
    .imgs img {
        max-height: 190px;
        border-radius: 10px;
    }
    .files {
        margin-top: 8px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }
    .file {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--text-dim);
        background: rgb(var(--holo) / 0.08);
        border-radius: 6px;
        padding: 3px 8px;
    }

    .nero .prose {
        max-width: 78%;
        font-family: var(--font-ui);
        font-size: 15px;
        line-height: 1.62;
        color: color-mix(in oklch, var(--text) 92%, transparent);
    }

    .system pre {
        max-width: 78%;
        margin: 0;
        font-family: var(--font-mono);
        font-size: 12.5px;
        line-height: 1.55;
        color: var(--text-dim);
        white-space: pre-wrap;
        padding: 10px 14px;
        border-radius: 10px;
        border-left: 2px solid rgb(var(--holo) / 0.4);
        background: rgb(var(--holo) / 0.04);
    }

    /* themed prose */
    .prose :global(p) {
        margin: 0 0 0.7em;
    }
    .prose :global(p:last-child) {
        margin-bottom: 0;
    }
    .prose :global(a) {
        color: rgb(var(--holo-soft));
        text-decoration: underline;
        text-underline-offset: 2px;
    }
    .prose :global(strong) {
        color: var(--text);
        font-weight: 600;
    }
    .prose :global(code) {
        font-family: var(--font-mono);
        font-size: 0.86em;
        color: rgb(var(--holo-soft));
        background: rgb(var(--holo) / 0.1);
        border: 1px solid rgb(var(--holo) / 0.16);
        border-radius: 5px;
        padding: 0.12em 0.38em;
    }
    .prose :global(pre) {
        background: var(--sunken);
        border: 1px solid rgb(var(--holo) / 0.14);
        border-radius: 10px;
        padding: 12px 14px;
        overflow-x: auto;
        margin: 0.7em 0;
    }
    .prose :global(pre code) {
        background: none;
        border: none;
        padding: 0;
        color: color-mix(in oklch, var(--text) 88%, transparent);
        font-size: 12.5px;
    }
    .prose :global(ul),
    .prose :global(ol) {
        padding-left: 1.4em;
        margin: 0.5em 0;
    }
    .prose :global(li) {
        margin: 0.25em 0;
    }
    .prose :global(blockquote) {
        border-left: 3px solid rgb(var(--holo) / 0.4);
        padding-left: 1em;
        margin: 0.7em 0;
        color: var(--text-dim);
        font-style: italic;
    }
    .prose :global(h1),
    .prose :global(h2),
    .prose :global(h3) {
        color: var(--text);
        font-weight: 600;
        margin: 0.9em 0 0.4em;
        font-size: 1.05em;
    }
    .prose :global(h1:first-child),
    .prose :global(h2:first-child),
    .prose :global(h3:first-child) {
        margin-top: 0;
    }
</style>
