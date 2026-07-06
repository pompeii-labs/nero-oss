<script lang="ts">
    import { goto } from '$app/navigation';
    import type { ProjectRow, ProjectTaskRow } from '$lib/lux';

    let {
        project,
        tasks,
        onPause,
        onResume,
        onCancel,
        onDismiss,
    }: {
        project: ProjectRow;
        tasks: ProjectTaskRow[];
        onPause: () => void;
        onResume: () => void;
        onCancel: () => void;
        onDismiss: () => void;
    } = $props();

    const ordered = $derived([...tasks].sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0)));
    const spent = $derived(project.spent_usd ?? 0);
    const budget = $derived(project.budget_usd ?? 0);
    const pct = $derived(budget > 0 ? Math.min(100, (spent / budget) * 100) : 0);
    const doneCount = $derived(ordered.filter((t) => t.status === 'done').length);
    const terminal = $derived(
        project.status === 'done' || project.status === 'error' || project.status === 'cancelled',
    );
    const near = $derived(pct >= 80);

    function liveLine(t: ProjectTaskRow): string {
        if (t.status === 'done') return t.result?.split('\n')[0]?.slice(0, 80) ?? '';
        if (t.status === 'running') {
            const act = (t.activities ?? []).at(-1);
            if (act) return `${act.displayName ?? act.tool}…`;
            const tail = (t.streaming_text ?? '').trim().split('\n').at(-1) ?? '';
            return tail.slice(-80);
        }
        return '';
    }

    const dot: Record<string, string> = {
        pending: '○',
        running: '◐',
        done: '●',
        failed: '✕',
        skipped: '–',
        cancelled: '–',
    };
</script>

<div class="pp" class:terminal>
    <header class="pp-head">
        <i class="pp-dot" class:run={project.status === 'running'}></i>
        <button class="pp-title" title="Open project" onclick={() => goto(`/projects/${project.id}`)}
            >{project.title}</button
        >
        <span class="pp-status pp-{project.status}">{project.status}</span>
        <button class="pp-open" title="Open full view" onclick={() => goto(`/projects/${project.id}`)}
            >⤢</button
        >
        <button class="pp-x" title="Hide" onclick={onDismiss}>×</button>
    </header>

    <div class="pp-meter">
        <div class="pp-bar"><i class="pp-fill" class:near style="width:{pct}%"></i></div>
        <span class="pp-spend"
            >${spent.toFixed(3)}{budget > 0 ? ` / $${budget.toFixed(2)}` : ''}</span
        >
        <span class="pp-prog">{doneCount}/{ordered.length}</span>
    </div>

    <ul class="pp-tasks">
        {#each ordered as t (t.id)}
            <li class="pp-task pp-t-{t.status}">
                <span class="pp-tdot">{dot[t.status ?? 'pending'] ?? '○'}</span>
                <span class="pp-tbody">
                    <span class="pp-ttitle">{t.title}</span>
                    {#if liveLine(t)}<span class="pp-tlive">{liveLine(t)}</span>{/if}
                </span>
                {#if (t.cost_usd ?? 0) > 0}<span class="pp-tcost">${t.cost_usd?.toFixed(3)}</span>{/if}
            </li>
        {/each}
    </ul>

    {#if project.status === 'paused'}
        <p class="pp-note">Paused at the budget. Resume to keep going.</p>
    {/if}
    {#if project.status === 'error' && project.error}
        <p class="pp-note pp-err">{project.error}</p>
    {/if}

    {#if terminal && project.result}
        <button class="pp-result-toggle" onclick={() => goto(`/projects/${project.id}`)}>
            View deliverable →
        </button>
    {/if}

    <div class="pp-actions">
        {#if project.status === 'running'}
            <button class="pp-btn" onclick={onPause}>Pause</button>
            <button class="pp-btn danger" onclick={onCancel}>Stop</button>
        {:else if project.status === 'paused'}
            <button class="pp-btn primary" onclick={onResume}>Resume</button>
            <button class="pp-btn danger" onclick={onCancel}>Stop</button>
        {:else}
            <button class="pp-btn" onclick={onDismiss}>Dismiss</button>
        {/if}
    </div>
</div>

<style>
    .pp {
        width: min(320px, 100%);
        background: var(--panel-bg);
        border: 1px solid rgb(var(--holo) / 0.3);
        border-radius: 13px;
        padding: 13px 14px 11px;
        backdrop-filter: blur(12px);
        box-shadow:
            0 0 0 1px rgb(var(--holo) / 0.08),
            0 24px 60px -28px rgb(0 0 0 / 0.85),
            0 0 40px -18px rgb(var(--holo) / 0.35);
        animation: pp-in 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .pp.terminal {
        opacity: 0.96;
    }
    @keyframes pp-in {
        from {
            opacity: 0;
            transform: translateX(-10px);
        }
        to {
            opacity: 1;
            transform: none;
        }
    }

    .pp-head {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 11px;
    }
    .pp-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: rgb(var(--holo) / 0.5);
    }
    .pp-dot.run {
        background: rgb(var(--holo));
        box-shadow: 0 0 8px rgb(var(--holo));
        animation: pp-pulse 1.4s ease-in-out infinite;
    }
    @keyframes pp-pulse {
        0%,
        100% {
            opacity: 1;
        }
        50% {
            opacity: 0.35;
        }
    }
    .pp-title {
        flex: 1;
        min-width: 0;
        text-align: left;
        border: none;
        background: none;
        padding: 0;
        cursor: pointer;
        font-family: var(--font-display);
        font-size: 14px;
        font-weight: 600;
        color: var(--text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .pp-title:hover {
        color: rgb(var(--holo));
    }
    .pp-open {
        width: 20px;
        height: 20px;
        line-height: 1;
        font-size: 13px;
        border: none;
        background: none;
        color: var(--text-faint);
        cursor: pointer;
        border-radius: 5px;
    }
    .pp-open:hover {
        color: var(--text);
        background: rgb(var(--holo) / 0.12);
    }
    .pp-status {
        font-family: var(--font-mono);
        font-size: 9px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        padding: 2px 6px;
        border-radius: 999px;
        border: 1px solid rgb(var(--holo) / 0.3);
        color: var(--text-dim);
    }
    .pp-running {
        color: var(--text);
        background: rgb(var(--holo) / 0.14);
    }
    .pp-paused {
        color: #e7b34a;
        border-color: #e7b34a66;
    }
    .pp-error {
        color: #e7674a;
        border-color: #e7674a66;
    }
    .pp-done {
        color: #4ae08a;
        border-color: #4ae08a66;
    }
    .pp-x {
        margin-left: auto;
        width: 20px;
        height: 20px;
        line-height: 1;
        font-size: 16px;
        border: none;
        background: none;
        color: var(--text-faint);
        cursor: pointer;
        border-radius: 5px;
    }
    .pp-x:hover {
        color: var(--text);
        background: rgb(var(--holo) / 0.12);
    }

    .pp-meter {
        display: flex;
        align-items: center;
        gap: 9px;
        margin-bottom: 11px;
    }
    .pp-bar {
        flex: 1;
        height: 4px;
        border-radius: 999px;
        background: rgb(var(--holo) / 0.12);
        overflow: hidden;
    }
    .pp-fill {
        display: block;
        height: 100%;
        background: rgb(var(--holo));
        transition: width 0.4s ease;
    }
    .pp-fill.near {
        background: #e7b34a;
    }
    .pp-spend {
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--text-dim);
    }
    .pp-prog {
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--text-faint);
    }

    .pp-tasks {
        list-style: none;
        margin: 0 0 10px;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 240px;
        overflow-y: auto;
    }
    .pp-task {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 5px 2px;
    }
    .pp-tdot {
        flex-shrink: 0;
        font-size: 11px;
        line-height: 1.5;
        color: var(--text-faint);
        width: 12px;
        text-align: center;
    }
    .pp-t-running .pp-tdot {
        color: rgb(var(--holo));
    }
    .pp-t-done .pp-tdot {
        color: #4ae08a;
    }
    .pp-t-failed .pp-tdot {
        color: #e7674a;
    }
    .pp-tbody {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
        flex: 1;
    }
    .pp-ttitle {
        font-size: 12.5px;
        color: var(--text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .pp-t-pending .pp-ttitle {
        color: var(--text-dim);
    }
    .pp-tlive {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--text-faint);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .pp-tcost {
        flex-shrink: 0;
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--text-faint);
        padding-top: 1px;
    }

    .pp-note {
        margin: 0 0 10px;
        font-size: 11.5px;
        color: var(--text-dim);
        line-height: 1.4;
    }
    .pp-err {
        color: #e7674a;
    }

    .pp-result-toggle {
        width: 100%;
        margin-bottom: 8px;
        padding: 7px;
        border-radius: 8px;
        border: 1px solid rgb(var(--holo) / 0.25);
        background: rgb(var(--holo) / 0.06);
        color: var(--text-dim);
        font-family: var(--font-mono);
        font-size: 11px;
        cursor: pointer;
    }
    .pp-result-toggle:hover {
        color: var(--text);
        background: rgb(var(--holo) / 0.12);
    }
    .pp-result {
        margin: 0 0 10px;
        max-height: 260px;
        overflow-y: auto;
        padding: 10px 11px;
        border-radius: 8px;
        background: rgb(0 0 0 / 0.25);
        border: 1px solid rgb(var(--holo) / 0.15);
        font-family: var(--font-mono);
        font-size: 11px;
        line-height: 1.5;
        color: var(--text);
        white-space: pre-wrap;
        word-break: break-word;
    }

    .pp-actions {
        display: flex;
        gap: 7px;
    }
    .pp-btn {
        flex: 1;
        padding: 7px;
        border-radius: 8px;
        border: 1px solid rgb(var(--holo) / 0.22);
        background: none;
        color: var(--text-dim);
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        cursor: pointer;
    }
    .pp-btn:hover {
        background: rgb(var(--holo) / 0.1);
        color: var(--text);
    }
    .pp-btn.primary {
        border-color: rgb(var(--holo) / 0.55);
        background: rgb(var(--holo) / 0.18);
        color: var(--text);
    }
    .pp-btn.danger:hover {
        border-color: #e7674a88;
        color: #e7674a;
        background: #e7674a18;
    }
</style>
