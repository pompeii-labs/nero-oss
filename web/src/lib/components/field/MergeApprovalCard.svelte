<script lang="ts">
    import type { ProjectRow } from '$lib/lux';

    let {
        project,
        onApprove,
        onReject,
    }: {
        project: ProjectRow;
        onApprove: () => void;
        onReject: () => void;
    } = $props();

    const conflict = $derived(project.merge_conflict);
</script>

{#if conflict}
    <div class="mc">
        <div class="mc-card">
            <div class="mc-head">
                <span class="mc-dot"></span>
                <span class="mc-tag">Merge conflict</span>
                <span class="mc-count">{conflict.files.length} files</span>
            </div>
            <h2 class="mc-title">{project.title}</h2>
            <p class="mc-sub">
                Task <strong>{conflict.task_title}</strong> conflicted with the integration branch.
                Nero staged a resolution, review it before it commits.
            </p>

            {#if conflict.files.length}
                <ul class="mc-files">
                    {#each conflict.files as f (f)}
                        <li>{f}</li>
                    {/each}
                </ul>
            {/if}

            <div class="mc-difflabel">Proposed resolution</div>
            <pre class="mc-diff">{conflict.diff || '(no diff)'}</pre>

            <div class="mc-actions">
                <button class="mc-btn primary" onclick={onApprove}>Approve merge</button>
                <button class="mc-btn danger" onclick={onReject}>Reject</button>
            </div>
        </div>
    </div>
{/if}

<style>
    .mc {
        position: fixed;
        inset: 0;
        z-index: 62;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgb(4 5 8 / 0.5);
        backdrop-filter: blur(2px);
    }
    .mc-card {
        width: min(680px, 100%);
        max-height: 82vh;
        overflow-y: auto;
        background:
            linear-gradient(rgb(var(--holo) / 0.06), rgb(var(--holo) / 0.06)),
            var(--bg, #0a0b0e);
        border: 1px solid rgb(var(--holo) / 0.3);
        border-radius: 14px;
        padding: 16px 18px 14px;
        backdrop-filter: blur(12px);
        box-shadow:
            0 0 0 1px rgb(var(--holo) / 0.08),
            0 30px 70px -24px rgb(0 0 0 / 0.9),
            0 0 50px -16px rgb(var(--holo) / 0.4);
    }
    .mc-head {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
    }
    .mc-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #e7b34a;
        box-shadow: 0 0 8px #e7b34a;
    }
    .mc-tag {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #e7b34a;
    }
    .mc-count {
        margin-left: auto;
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--text-faint);
    }
    .mc-title {
        margin: 0 0 4px;
        font-family: var(--font-display);
        font-size: 18px;
        font-weight: 600;
        color: var(--text);
    }
    .mc-sub {
        margin: 0 0 12px;
        font-size: 13px;
        line-height: 1.5;
        color: var(--text-dim);
    }
    .mc-files {
        margin: 0 0 12px;
        padding: 0 0 0 2px;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 3px;
        font-family: var(--font-mono);
        font-size: 11.5px;
        color: var(--text);
    }
    .mc-difflabel {
        font-family: var(--font-mono);
        font-size: 9.5px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--text-faint);
        margin-bottom: 6px;
    }
    .mc-diff {
        margin: 0 0 14px;
        max-height: 38vh;
        overflow: auto;
        padding: 11px 13px;
        border-radius: 8px;
        background: rgb(0 0 0 / 0.28);
        border: 1px solid rgb(var(--holo) / 0.12);
        font-family: var(--font-mono);
        font-size: 11.5px;
        line-height: 1.55;
        color: var(--text);
        white-space: pre;
    }
    .mc-actions {
        display: flex;
        gap: 8px;
    }
    .mc-btn {
        flex: 1;
        padding: 9px;
        border-radius: 9px;
        border: 1px solid rgb(var(--holo) / 0.22);
        background: none;
        color: var(--text-dim);
        font-family: var(--font-mono);
        font-size: 11.5px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        cursor: pointer;
    }
    .mc-btn:hover {
        background: rgb(var(--holo) / 0.1);
        color: var(--text);
    }
    .mc-btn.primary {
        border-color: rgb(var(--holo) / 0.55);
        background: rgb(var(--holo) / 0.18);
        color: var(--text);
    }
    .mc-btn.danger:hover {
        border-color: #e7674a88;
        color: #e7674a;
        background: #e7674a18;
    }
</style>
