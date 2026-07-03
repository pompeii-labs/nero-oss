<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { page } from '$app/state';
    import { goto } from '$app/navigation';
    import { marked } from 'marked';
    import { fieldTheme } from '$lib/stores/field-theme.svelte';
    import {
        subscribeProjects,
        subscribeProjectTasks,
        type ProjectRow,
        type ProjectTaskRow,
    } from '$lib/lux';
    import { pauseProject, resumeProject, cancelProject } from '$lib/actions/projects';

    marked.setOptions({ breaks: true, gfm: true });
    const md = (t?: string | null) => marked.parse(t ?? '') as string;

    const projectId = $derived(page.params.id);

    let projectMap = $state<Record<string, ProjectRow>>({});
    let taskMap = $state<Record<string, ProjectTaskRow>>({});
    let unsubP: (() => void) | null = null;
    let unsubT: (() => void) | null = null;
    // 'deliverable' is a virtual step; otherwise a task id.
    let selectedId = $state<string | null>(null);
    // The activity whose full input/result is open in the right slideover.
    type Act = NonNullable<ProjectTaskRow['activities']>[number];
    let openAct = $state<Act | null>(null);

    const project = $derived(projectId ? (projectMap[projectId] ?? null) : null);
    const tasks = $derived(
        Object.values(taskMap)
            .filter((t) => t.project_id === projectId)
            .sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0)),
    );
    const hasDeliverable = $derived(!!project?.result?.trim());
    const selected = $derived(
        selectedId && selectedId !== 'deliverable' ? (taskMap[selectedId] ?? null) : null,
    );

    // Default view: the deliverable if the project is done, else the running task.
    $effect(() => {
        if (selectedId && (selectedId === 'deliverable' ? hasDeliverable : taskMap[selectedId]))
            return;
        if (hasDeliverable) selectedId = 'deliverable';
        else {
            const pick = tasks.find((t) => t.status === 'running') ?? tasks[0];
            if (pick) selectedId = pick.id;
        }
    });

    // Auto-scroll the live stream while a task is running.
    let streamEl = $state<HTMLElement>();
    $effect(() => {
        selected?.streaming_text;
        if (selected?.status === 'running' && streamEl) streamEl.scrollTop = streamEl.scrollHeight;
    });

    // Close the slideover when switching steps.
    $effect(() => {
        selectedId;
        openAct = null;
    });

    onMount(async () => {
        unsubP = await subscribeProjects((c) => {
            if (c.kind === 'snapshot') {
                const o: Record<string, ProjectRow> = {};
                for (const r of c.rows) o[r.id] = r;
                projectMap = o;
            } else if (c.kind === 'upsert') {
                projectMap = { ...projectMap, [c.row.id]: c.row };
            } else if (c.kind === 'delete') {
                const o = { ...projectMap };
                delete o[c.row.id];
                projectMap = o;
            }
        });
        unsubT = await subscribeProjectTasks((c) => {
            if (c.kind === 'snapshot') {
                const o: Record<string, ProjectTaskRow> = {};
                for (const r of c.rows) o[r.id] = r;
                taskMap = o;
            } else if (c.kind === 'upsert') {
                taskMap = { ...taskMap, [c.row.id]: c.row };
            } else if (c.kind === 'delete') {
                const o = { ...taskMap };
                delete o[c.row.id];
                taskMap = o;
            }
        });
    });
    onDestroy(() => {
        unsubP?.();
        unsubT?.();
    });

    const spent = $derived(project?.spent_usd ?? 0);
    const budget = $derived(project?.budget_usd ?? 0);
    const pct = $derived(budget > 0 ? Math.min(100, (spent / budget) * 100) : 0);
    const doneCount = $derived(tasks.filter((t) => t.status === 'done').length);

    const dot: Record<string, string> = {
        pending: '○',
        running: '◐',
        done: '●',
        failed: '✕',
        skipped: '–',
        cancelled: '–',
    };

    function depLabel(t: ProjectTaskRow): string {
        const d = t.depends_on ?? [];
        return d.length ? `after ${d.map((i) => `#${i + 1}`).join(', ')}` : 'starts now';
    }
</script>

<div class="pd" data-theme={fieldTheme.dataTheme}>
    <header class="pd-top">
        <button class="pd-back" onclick={() => goto('/')} title="Back to Nero">←</button>
        <div class="pd-titlewrap">
            <h1 class="pd-title">{project?.title ?? 'Project'}</h1>
            {#if project?.goal}<p class="pd-goal">{project.goal}</p>{/if}
        </div>
        {#if project}
            <span class="pd-status pd-{project.status}">{project.status}</span>
        {/if}
        <div class="pd-meter">
            <div class="pd-bar">
                <i class="pd-fill" class:near={pct >= 80} style="width:{pct}%"></i>
            </div>
            <span class="pd-spend"
                >${spent.toFixed(3)}{budget > 0 ? ` / $${budget.toFixed(2)}` : ''}</span
            >
            <span class="pd-prog">{doneCount}/{tasks.length}</span>
        </div>
        <div class="pd-controls">
            {#if project?.status === 'running'}
                <button class="pd-ctl" onclick={() => project && pauseProject(project.id)}>Pause</button>
                <button class="pd-ctl danger" onclick={() => project && cancelProject(project.id)}>Stop</button>
            {:else if project?.status === 'paused'}
                <button class="pd-ctl primary" onclick={() => project && resumeProject(project.id)}>Resume</button>
                <button class="pd-ctl danger" onclick={() => project && cancelProject(project.id)}>Stop</button>
            {/if}
        </div>
    </header>

    <div class="pd-body">
        <aside class="pd-steps">
            {#if hasDeliverable}
                <button
                    class="pd-step pd-deliv"
                    class:sel={selectedId === 'deliverable'}
                    onclick={() => (selectedId = 'deliverable')}
                >
                    <span class="pd-sdot">★</span>
                    <span class="pd-sbody">
                        <span class="pd-stitle">Deliverable</span>
                        <span class="pd-sdep">the finished output</span>
                    </span>
                </button>
            {/if}
            {#each tasks as t, i (t.id)}
                <button
                    class="pd-step pd-s-{t.status}"
                    class:sel={selectedId === t.id}
                    onclick={() => (selectedId = t.id)}
                >
                    <span class="pd-sdot">{dot[t.status ?? 'pending'] ?? '○'}</span>
                    <span class="pd-sbody">
                        <span class="pd-snum">#{i + 1}</span>
                        <span class="pd-stitle">{t.title}</span>
                        <span class="pd-sdep">{depLabel(t)}</span>
                    </span>
                    {#if (t.cost_usd ?? 0) > 0}<span class="pd-scost">${t.cost_usd?.toFixed(3)}</span>{/if}
                </button>
            {/each}
        </aside>

        <main class="pd-detail">
            {#if selectedId === 'deliverable'}
                <div class="pd-dhead">
                    <span class="pd-ddot pd-deliv-dot">★</span>
                    <h2 class="pd-dtitle">Deliverable</h2>
                    <span class="pd-dmeta">{tasks.length} tasks · ${spent.toFixed(2)}</span>
                </div>
                <div class="pd-out prose">{@html md(project?.result)}</div>
            {:else if !selected}
                <div class="pd-empty">Pick a step to watch it work.</div>
            {:else}
                {@const s = selected}
                <div class="pd-dhead">
                    <span class="pd-ddot pd-s-{s.status}">{dot[s.status ?? 'pending'] ?? '○'}</span>
                    <h2 class="pd-dtitle">{s.title}</h2>
                    <span class="pd-dmeta">
                        {s.status}{(s.cost_usd ?? 0) > 0 ? ` · $${s.cost_usd?.toFixed(3)}` : ''}
                    </span>
                </div>

                {#if s.description}
                    <p class="pd-desc">{s.description}</p>
                {/if}

                {#if (s.activities ?? []).length}
                    <div class="pd-label">Activity · {(s.activities ?? []).length}</div>
                    <div class="pd-chips">
                        {#each s.activities ?? [] as a (a.id)}
                            <button
                                class="pd-chip pd-a-{a.status}"
                                onclick={() => (openAct = a)}
                                title="Open details"
                            >
                                <span class="pd-chipdot"></span>
                                <span class="pd-chipname">{a.displayName ?? a.tool}</span>
                            </button>
                        {/each}
                    </div>
                {/if}

                <div class="pd-label">
                    {s.status === 'done' ? 'Output' : 'Live output'}
                    {#if s.status === 'running'}<i class="pd-livedot"></i>{/if}
                </div>
                {#if s.status === 'done' && s.result}
                    <div class="pd-out prose">{@html md(s.result)}</div>
                {:else if (s.streaming_text ?? '').trim()}
                    <pre class="pd-out pd-stream" bind:this={streamEl}>{s.streaming_text}</pre>
                {:else if s.status === 'pending'}
                    <div class="pd-waiting">Waiting on its dependencies…</div>
                {:else}
                    <div class="pd-waiting">Starting…</div>
                {/if}
            {/if}
        </main>
    </div>

    {#if openAct}
        {@const a = openAct}
        <button class="pd-scrim" onclick={() => (openAct = null)} aria-label="Close details"></button>
        <aside class="pd-slide">
            <div class="pd-slide-head">
                <span class="pd-adot pd-a-{a.status}"></span>
                <span class="pd-slide-name">{a.displayName ?? a.tool}</span>
                <span class="pd-slide-status">{a.status}</span>
                <button class="pd-slide-x" onclick={() => (openAct = null)} title="Close">×</button>
            </div>
            {#if a.args && Object.keys(a.args).length}
                <div class="pd-label">Input</div>
                <pre class="pd-slide-args">{JSON.stringify(a.args, null, 2)}</pre>
            {/if}
            <div class="pd-label">Result</div>
            <div class="pd-slide-res">{a.result ?? '(no result captured)'}</div>
        </aside>
    {/if}
</div>

<style>
    .pd {
        height: 100vh;
        overflow: hidden;
        box-sizing: border-box;
        background: var(--bg, #08090c);
        color: var(--text);
        display: flex;
        flex-direction: column;
        padding: 18px 22px 20px;
        gap: 14px;
        font-family: var(--font-body, system-ui, sans-serif);
    }
    .pd-top {
        display: flex;
        align-items: center;
        gap: 14px;
        flex-shrink: 0;
    }
    .pd-back {
        flex-shrink: 0;
        width: 34px;
        height: 34px;
        border-radius: 9px;
        border: 1px solid rgb(var(--holo) / 0.25);
        background: rgb(var(--holo) / 0.05);
        color: var(--text-dim);
        font-size: 17px;
        cursor: pointer;
    }
    .pd-back:hover {
        color: var(--text);
        background: rgb(var(--holo) / 0.12);
    }
    .pd-titlewrap {
        min-width: 0;
    }
    .pd-title {
        margin: 0;
        font-family: var(--font-display);
        font-size: 21px;
        font-weight: 600;
        color: var(--text);
        line-height: 1.15;
    }
    .pd-goal {
        margin: 2px 0 0;
        font-size: 12.5px;
        color: var(--text-dim);
        max-width: 60ch;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .pd-status {
        flex-shrink: 0;
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        padding: 3px 8px;
        border-radius: 999px;
        border: 1px solid rgb(var(--holo) / 0.3);
        color: var(--text-dim);
    }
    .pd-running {
        color: var(--text);
        background: rgb(var(--holo) / 0.16);
    }
    .pd-paused {
        color: #e7b34a;
        border-color: #e7b34a66;
    }
    .pd-error {
        color: #e7674a;
        border-color: #e7674a66;
    }
    .pd-done {
        color: #4ae08a;
        border-color: #4ae08a66;
    }
    .pd-meter {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 220px;
    }
    .pd-bar {
        flex: 1;
        height: 5px;
        border-radius: 999px;
        background: rgb(var(--holo) / 0.12);
        overflow: hidden;
    }
    .pd-fill {
        display: block;
        height: 100%;
        background: rgb(var(--holo));
        transition: width 0.4s ease;
    }
    .pd-fill.near {
        background: #e7b34a;
    }
    .pd-spend,
    .pd-prog {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--text-dim);
    }
    .pd-controls {
        display: flex;
        gap: 7px;
    }
    .pd-ctl {
        padding: 7px 12px;
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
    .pd-ctl:hover {
        background: rgb(var(--holo) / 0.1);
        color: var(--text);
    }
    .pd-ctl.primary {
        border-color: rgb(var(--holo) / 0.55);
        background: rgb(var(--holo) / 0.18);
        color: var(--text);
    }
    .pd-ctl.danger:hover {
        border-color: #e7674a88;
        color: #e7674a;
        background: #e7674a18;
    }

    .pd-body {
        flex: 1;
        display: grid;
        grid-template-columns: 300px 1fr;
        gap: 16px;
        min-height: 0;
    }
    .pd-steps {
        display: flex;
        flex-direction: column;
        gap: 6px;
        overflow-y: auto;
        padding-right: 4px;
        min-height: 0;
    }
    .pd-step {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        text-align: left;
        padding: 11px 12px;
        border-radius: 10px;
        border: 1px solid rgb(var(--holo) / 0.16);
        background: rgb(var(--holo) / 0.03);
        color: var(--text);
        cursor: pointer;
        flex-shrink: 0;
        transition:
            background 0.12s,
            border-color 0.12s;
    }
    .pd-step:hover {
        background: rgb(var(--holo) / 0.08);
    }
    .pd-step.sel {
        border-color: rgb(var(--holo) / 0.6);
        background: rgb(var(--holo) / 0.13);
    }
    .pd-deliv {
        border-color: rgb(var(--holo) / 0.4);
        background: rgb(var(--holo) / 0.08);
    }
    .pd-sdot {
        flex-shrink: 0;
        font-size: 13px;
        line-height: 1.5;
        color: var(--text-faint);
        width: 14px;
        text-align: center;
    }
    .pd-deliv .pd-sdot {
        color: rgb(var(--holo));
    }
    .pd-s-running .pd-sdot {
        color: rgb(var(--holo));
        animation: pd-pulse 1.4s ease-in-out infinite;
    }
    .pd-s-done .pd-sdot {
        color: #4ae08a;
    }
    .pd-s-failed .pd-sdot {
        color: #e7674a;
    }
    @keyframes pd-pulse {
        0%,
        100% {
            opacity: 1;
        }
        50% {
            opacity: 0.35;
        }
    }
    .pd-sbody {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1;
    }
    .pd-snum {
        font-family: var(--font-mono);
        font-size: 9.5px;
        color: var(--text-faint);
    }
    .pd-stitle {
        font-size: 13px;
        color: var(--text);
        line-height: 1.3;
    }
    .pd-s-pending .pd-stitle {
        color: var(--text-dim);
    }
    .pd-sdep {
        font-family: var(--font-mono);
        font-size: 9px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--text-faint);
    }
    .pd-scost {
        flex-shrink: 0;
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--text-faint);
    }

    /* No box around the content: the detail pane is just a clean reading column
     *  so the markdown breathes instead of sitting in a nested card. */
    .pd-detail {
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-height: 0;
        padding: 2px 6px 0;
        overflow: hidden;
    }
    .pd-empty {
        margin: auto;
        color: var(--text-faint);
        font-family: var(--font-mono);
        font-size: 13px;
    }
    .pd-dhead {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-shrink: 0;
    }
    .pd-ddot {
        font-size: 14px;
        color: var(--text-faint);
    }
    .pd-deliv-dot {
        color: rgb(var(--holo));
    }
    .pd-dtitle {
        margin: 0;
        font-family: var(--font-display);
        font-size: 17px;
        font-weight: 600;
        color: var(--text);
    }
    .pd-dmeta {
        margin-left: auto;
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--text-dim);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .pd-label {
        display: flex;
        align-items: center;
        gap: 7px;
        flex-shrink: 0;
        font-family: var(--font-mono);
        font-size: 9.5px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--text-faint);
    }
    .pd-livedot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: rgb(var(--holo));
        box-shadow: 0 0 8px rgb(var(--holo));
        animation: pd-pulse 1.2s ease-in-out infinite;
    }
    .pd-desc {
        margin: 0;
        flex-shrink: 0;
        font-size: 13px;
        line-height: 1.5;
        color: var(--text-dim);
    }
    /* Activity as clickable chips; the full input/result opens in the slideover. */
    .pd-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        flex-shrink: 0;
    }
    .pd-chip {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 5px 11px;
        border-radius: 999px;
        border: 1px solid rgb(var(--holo) / 0.18);
        background: rgb(var(--holo) / 0.05);
        color: var(--text-dim);
        font-size: 11.5px;
        cursor: pointer;
        transition:
            background 0.12s,
            color 0.12s,
            border-color 0.12s;
    }
    .pd-chip:hover {
        background: rgb(var(--holo) / 0.12);
        color: var(--text);
        border-color: rgb(var(--holo) / 0.35);
    }
    .pd-chipdot {
        flex-shrink: 0;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--text-faint);
    }
    .pd-chip.pd-a-running .pd-chipdot {
        background: rgb(var(--holo));
    }
    .pd-chip.pd-a-success .pd-chipdot {
        background: #4ae08a;
    }
    .pd-chip.pd-a-error .pd-chipdot {
        background: #e7674a;
    }
    .pd-chipname {
        max-width: 220px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .pd-adot {
        flex-shrink: 0;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--text-faint);
    }
    .pd-adot.pd-a-running {
        background: rgb(var(--holo));
    }
    .pd-adot.pd-a-success {
        background: #4ae08a;
    }
    .pd-adot.pd-a-error {
        background: #e7674a;
    }
    /* Right slideover: a tool call's full input + result, with real vertical room. */
    .pd-scrim {
        position: fixed;
        inset: 0;
        z-index: 80;
        border: none;
        background: rgb(0 0 0 / 0.45);
        cursor: default;
        animation: pd-fade 0.15s ease;
    }
    @keyframes pd-fade {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }
    .pd-slide {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        z-index: 81;
        width: min(480px, 94vw);
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 11px;
        padding: 20px;
        background: var(--panel-bg, #0c0e12);
        border-left: 1px solid rgb(var(--holo) / 0.22);
        box-shadow: -40px 0 80px -30px rgb(0 0 0 / 0.9);
        animation: pd-slidein 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    @keyframes pd-slidein {
        from {
            transform: translateX(24px);
            opacity: 0;
        }
        to {
            transform: none;
            opacity: 1;
        }
    }
    .pd-slide-head {
        display: flex;
        align-items: center;
        gap: 9px;
        flex-shrink: 0;
    }
    .pd-slide-name {
        flex: 1;
        min-width: 0;
        font-family: var(--font-display);
        font-size: 15px;
        font-weight: 600;
        color: var(--text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .pd-slide-status {
        font-family: var(--font-mono);
        font-size: 9.5px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-dim);
    }
    .pd-slide-x {
        flex-shrink: 0;
        width: 26px;
        height: 26px;
        line-height: 1;
        font-size: 18px;
        border: none;
        background: none;
        color: var(--text-faint);
        cursor: pointer;
        border-radius: 6px;
    }
    .pd-slide-x:hover {
        color: var(--text);
        background: rgb(var(--holo) / 0.12);
    }
    .pd-slide-args {
        flex-shrink: 0;
        max-height: 26vh;
        overflow-y: auto;
        margin: 0;
        padding: 10px 12px;
        border-radius: 8px;
        background: rgb(var(--holo) / 0.05);
        font-family: var(--font-mono);
        font-size: 11px;
        line-height: 1.5;
        color: var(--text-dim);
        white-space: pre-wrap;
        word-break: break-word;
    }
    .pd-slide-res {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        font-family: var(--font-mono);
        font-size: 12px;
        line-height: 1.6;
        color: var(--text);
        white-space: pre-wrap;
        word-break: break-word;
    }
    /* The one scroll region in the detail pane. No box: content flows on the page. */
    .pd-out {
        flex: 1;
        min-height: 0;
        margin: 0;
        overflow-y: auto;
        padding: 2px 2px 28px;
    }
    .pd-stream {
        font-family: var(--font-mono);
        font-size: 12px;
        line-height: 1.6;
        color: var(--text);
        white-space: pre-wrap;
        word-break: break-word;
    }
    .pd-waiting {
        color: var(--text-faint);
        font-family: var(--font-mono);
        font-size: 12px;
        padding: 12px 0;
    }
</style>
