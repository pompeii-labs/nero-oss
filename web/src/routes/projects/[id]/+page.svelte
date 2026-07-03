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

    // Right pane: 'overview' (the briefing) or a task id (its agent trajectory).
    let view = $state<string>('overview');
    // Slideover contents: the deliverable, a task's output, or one tool call.
    type Act = NonNullable<ProjectTaskRow['activities']>[number];
    type Slide =
        | { kind: 'deliverable' }
        | { kind: 'output'; task: ProjectTaskRow }
        | { kind: 'tool'; act: Act }
        | null;
    let slide = $state<Slide>(null);

    const project = $derived(projectId ? (projectMap[projectId] ?? null) : null);
    const tasks = $derived(
        Object.values(taskMap)
            .filter((t) => t.project_id === projectId)
            .sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0)),
    );
    const hasDeliverable = $derived(!!project?.result?.trim());
    const current = $derived(view !== 'overview' ? (taskMap[view] ?? null) : null);
    const outputs = $derived(tasks.filter((t) => t.result?.trim()));

    // If a selected task vanishes, fall back to the overview.
    $effect(() => {
        if (view !== 'overview' && !taskMap[view]) view = 'overview';
    });
    // Close the slideover when the main view changes.
    $effect(() => {
        view;
        slide = null;
    });

    // Auto-scroll a running task's live stream.
    let streamEl = $state<HTMLElement>();
    $effect(() => {
        current?.streaming_text;
        if (current?.status === 'running' && streamEl) streamEl.scrollTop = streamEl.scrollHeight;
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
    const actionCount = $derived(
        tasks.reduce((n, t) => n + (t.activities ?? []).length, 0),
    );

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

    // One-line summary of what a tool was called with (the query, url, path...).
    function argSummary(a: Act): string {
        const args = a.args as Record<string, unknown> | undefined;
        if (!args) return '';
        for (const k of ['query', 'url', 'path', 'q', 'command', 'name', 'goal', 'title']) {
            const v = args[k];
            if (typeof v === 'string' && v.trim()) return v.trim();
        }
        const first = Object.values(args).find((v) => typeof v === 'string' && v.trim());
        return typeof first === 'string' ? first : '';
    }

    // First readable paragraph of the deliverable (overview synthesis fallback for
    // projects finalized before the summary column existed).
    function snippet(text?: string | null): string {
        if (!text) return '';
        const paras = text
            .replace(/```[\s\S]*?```/g, '')
            .split(/\n\s*\n/)
            .map((p) => p.replace(/^#+.*$/gm, '').replace(/[*_`>#]/g, '').trim())
            .filter((p) => p.length > 40);
        return (paras[0] ?? '').slice(0, 340);
    }
    const synthesis = $derived(project?.summary?.trim() || snippet(project?.result));
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
                <button class="pd-ctl" onclick={() => project && pauseProject(project.id)}
                    >Pause</button
                >
                <button class="pd-ctl danger" onclick={() => project && cancelProject(project.id)}
                    >Stop</button
                >
            {:else if project?.status === 'paused'}
                <button class="pd-ctl primary" onclick={() => project && resumeProject(project.id)}
                    >Resume</button
                >
                <button class="pd-ctl danger" onclick={() => project && cancelProject(project.id)}
                    >Stop</button
                >
            {/if}
        </div>
    </header>

    <div class="pd-body">
        <aside class="pd-nav">
            <button
                class="pd-navitem"
                class:sel={view === 'overview'}
                onclick={() => (view = 'overview')}
            >
                <span class="pd-navdot pd-ov">◆</span>
                <span class="pd-navtitle">Overview</span>
            </button>
            {#each tasks as t, i (t.id)}
                <button
                    class="pd-navitem pd-s-{t.status}"
                    class:sel={view === t.id}
                    onclick={() => (view = t.id)}
                >
                    <span class="pd-navdot">{dot[t.status ?? 'pending'] ?? '○'}</span>
                    <span class="pd-navbody">
                        <span class="pd-navnum">#{i + 1}</span>
                        <span class="pd-navtitle">{t.title}</span>
                    </span>
                    {#if (t.cost_usd ?? 0) > 0}<span class="pd-navcost"
                            >${t.cost_usd?.toFixed(3)}</span
                        >{/if}
                </button>
            {/each}
        </aside>

        <main class="pd-main">
            {#if view === 'overview'}
                {#if synthesis}
                    <section class="pd-sec">
                        <div class="pd-label">Synthesis</div>
                        <p class="pd-synth">{synthesis}</p>
                    </section>
                {/if}

                <section class="pd-sec">
                    <div class="pd-label">
                        How it was built · {tasks.length}
                        {tasks.length === 1 ? 'step' : 'steps'}
                        {#if actionCount > 0}· {actionCount} actions{/if}
                    </div>
                    <ol class="pd-flow">
                        {#each tasks as t, i (t.id)}
                            <li class="pd-flownode pd-s-{t.status}">
                                <button class="pd-flowbtn" onclick={() => (view = t.id)}>
                                    <span class="pd-flownum">{i + 1}</span>
                                    <span class="pd-flowbody">
                                        <span class="pd-flowtitle">{t.title}</span>
                                        <span class="pd-flowmeta">
                                            {depLabel(t)}{(t.activities ?? []).length
                                                ? ` · ${(t.activities ?? []).length} actions`
                                                : ''}{(t.cost_usd ?? 0) > 0
                                                ? ` · $${t.cost_usd?.toFixed(3)}`
                                                : ''}
                                        </span>
                                    </span>
                                    <span class="pd-flowarrow">→</span>
                                </button>
                            </li>
                        {/each}
                    </ol>
                </section>

                {#if hasDeliverable || outputs.length}
                    <section class="pd-sec">
                        <div class="pd-label">Artifacts</div>
                        <div class="pd-chips">
                            {#if hasDeliverable}
                                <button
                                    class="pd-chip pd-chip-star"
                                    onclick={() => (slide = { kind: 'deliverable' })}
                                >
                                    <span class="pd-chipstar">★</span> Full write-up
                                </button>
                            {/if}
                            {#each outputs as t (t.id)}
                                <button
                                    class="pd-chip"
                                    onclick={() => (slide = { kind: 'output', task: t })}
                                >
                                    <span class="pd-chipnum">#{(t.idx ?? 0) + 1}</span>
                                    {t.title}
                                </button>
                            {/each}
                        </div>
                    </section>
                {/if}
            {:else if current}
                {@const s = current}
                <div class="pd-dhead">
                    <span class="pd-ddot pd-s-{s.status}">{dot[s.status ?? 'pending'] ?? '○'}</span>
                    <h2 class="pd-dtitle">{s.title}</h2>
                    <span class="pd-dmeta">
                        {s.status}{(s.cost_usd ?? 0) > 0 ? ` · $${s.cost_usd?.toFixed(3)}` : ''}
                    </span>
                    {#if s.result?.trim()}
                        <button
                            class="pd-outbtn"
                            onclick={() => (slide = { kind: 'output', task: s })}
                        >
                            View output →
                        </button>
                    {/if}
                </div>

                {#if s.description}
                    <p class="pd-desc">{s.description}</p>
                {/if}

                <div class="pd-label">
                    Trajectory{(s.activities ?? []).length
                        ? ` · ${(s.activities ?? []).length}`
                        : ''}
                    {#if s.status === 'running'}<i class="pd-livedot"></i>{/if}
                </div>
                {#if (s.activities ?? []).length}
                    <ol class="pd-traj">
                        {#each s.activities ?? [] as a (a.id)}
                            <li class="pd-trow pd-a-{a.status}">
                                <button
                                    class="pd-trowbtn"
                                    onclick={() => (slide = { kind: 'tool', act: a })}
                                >
                                    <span class="pd-tdot"></span>
                                    <span class="pd-tname">{a.displayName ?? a.tool}</span>
                                    {#if argSummary(a)}<span class="pd-targ">{argSummary(a)}</span
                                        >{/if}
                                    <span class="pd-topen">open</span>
                                </button>
                            </li>
                        {/each}
                    </ol>
                {:else if s.status === 'running' && (s.streaming_text ?? '').trim()}
                    <pre class="pd-stream" bind:this={streamEl}>{s.streaming_text}</pre>
                {:else if s.status === 'pending'}
                    <div class="pd-waiting">Waiting on its dependencies…</div>
                {:else}
                    <div class="pd-waiting">No activity recorded for this step.</div>
                {/if}
            {:else}
                <div class="pd-empty">Pick a step.</div>
            {/if}
        </main>
    </div>

    {#if slide}
        {@const sl = slide}
        <button class="pd-scrim" onclick={() => (slide = null)} aria-label="Close"></button>
        <aside class="pd-slide" class:wide={sl.kind !== 'tool'}>
            {#if sl.kind === 'deliverable'}
                <div class="pd-slide-head">
                    <span class="pd-slide-star">★</span>
                    <span class="pd-slide-name">Deliverable</span>
                    <button class="pd-slide-x" onclick={() => (slide = null)} title="Close">×</button
                    >
                </div>
                <div class="pd-slide-doc prose">{@html md(project?.result)}</div>
            {:else if sl.kind === 'output'}
                <div class="pd-slide-head">
                    <span class="pd-adot pd-a-success"></span>
                    <span class="pd-slide-name">{sl.task.title}</span>
                    <button class="pd-slide-x" onclick={() => (slide = null)} title="Close">×</button
                    >
                </div>
                <div class="pd-slide-doc prose">{@html md(sl.task.result)}</div>
            {:else}
                {@const a = sl.act}
                <div class="pd-slide-head">
                    <span class="pd-adot pd-a-{a.status}"></span>
                    <span class="pd-slide-name">{a.displayName ?? a.tool}</span>
                    <span class="pd-slide-status">{a.status}</span>
                    <button class="pd-slide-x" onclick={() => (slide = null)} title="Close">×</button
                    >
                </div>
                {#if a.args && Object.keys(a.args).length}
                    <div class="pd-label">Input</div>
                    <pre class="pd-slide-args">{JSON.stringify(a.args, null, 2)}</pre>
                {/if}
                <div class="pd-label">Result</div>
                <div class="pd-slide-res">{a.result ?? '(no result captured)'}</div>
            {/if}
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
        grid-template-columns: 262px 1fr;
        gap: 20px;
        min-height: 0;
    }

    /* Left nav rail */
    .pd-nav {
        display: flex;
        flex-direction: column;
        gap: 4px;
        overflow-y: auto;
        padding-right: 4px;
        min-height: 0;
    }
    .pd-navitem {
        display: flex;
        align-items: center;
        gap: 9px;
        text-align: left;
        padding: 9px 11px;
        border-radius: 9px;
        border: 1px solid transparent;
        background: none;
        color: var(--text);
        cursor: pointer;
        flex-shrink: 0;
        transition:
            background 0.12s,
            border-color 0.12s;
    }
    .pd-navitem:hover {
        background: rgb(var(--holo) / 0.06);
    }
    .pd-navitem.sel {
        border-color: rgb(var(--holo) / 0.5);
        background: rgb(var(--holo) / 0.12);
    }
    .pd-navdot {
        flex-shrink: 0;
        width: 14px;
        font-size: 12px;
        text-align: center;
        color: var(--text-faint);
    }
    .pd-navdot.pd-ov {
        color: rgb(var(--holo));
    }
    .pd-s-running .pd-navdot {
        color: rgb(var(--holo));
    }
    .pd-s-done .pd-navdot {
        color: #4ae08a;
    }
    .pd-s-failed .pd-navdot {
        color: #e7674a;
    }
    .pd-navbody {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
        flex: 1;
    }
    .pd-navnum {
        font-family: var(--font-mono);
        font-size: 9px;
        color: var(--text-faint);
    }
    .pd-navtitle {
        font-size: 12.5px;
        color: var(--text);
        line-height: 1.3;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
    }
    .pd-s-pending .pd-navtitle {
        color: var(--text-dim);
    }
    .pd-navcost {
        flex-shrink: 0;
        align-self: flex-start;
        font-family: var(--font-mono);
        font-size: 9.5px;
        color: var(--text-faint);
    }

    /* Main pane: a clean full-width column, no box. */
    .pd-main {
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 22px;
        padding: 2px 2px 40px;
    }
    .pd-empty {
        margin: auto;
        color: var(--text-faint);
        font-family: var(--font-mono);
        font-size: 13px;
    }
    .pd-label {
        display: flex;
        align-items: center;
        gap: 7px;
        flex-shrink: 0;
        margin-bottom: 10px;
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
    @keyframes pd-pulse {
        0%,
        100% {
            opacity: 1;
        }
        50% {
            opacity: 0.35;
        }
    }

    /* Overview: synthesis */
    .pd-sec {
        flex-shrink: 0;
    }
    .pd-synth {
        margin: 0;
        max-width: 78ch;
        font-size: 17px;
        line-height: 1.6;
        color: var(--text);
        white-space: pre-line;
    }

    /* Overview: trajectory flow */
    .pd-flow {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .pd-flownode {
        position: relative;
    }
    .pd-flownode:not(:last-child)::after {
        content: '';
        position: absolute;
        left: 25px;
        top: 100%;
        height: 8px;
        width: 1px;
        background: rgb(var(--holo) / 0.2);
    }
    .pd-flowbtn {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 14px;
        text-align: left;
        padding: 13px 15px;
        border-radius: 11px;
        border: 1px solid rgb(var(--holo) / 0.14);
        background: rgb(var(--holo) / 0.03);
        color: var(--text);
        cursor: pointer;
        transition:
            background 0.12s,
            border-color 0.12s;
    }
    .pd-flowbtn:hover {
        background: rgb(var(--holo) / 0.08);
        border-color: rgb(var(--holo) / 0.3);
    }
    .pd-flownum {
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        display: grid;
        place-items: center;
        border-radius: 50%;
        border: 1px solid rgb(var(--holo) / 0.35);
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--text-dim);
    }
    .pd-s-done .pd-flownum {
        border-color: #4ae08a66;
        color: #4ae08a;
    }
    .pd-s-running .pd-flownum {
        border-color: rgb(var(--holo));
        color: rgb(var(--holo));
        animation: pd-pulse 1.4s ease-in-out infinite;
    }
    .pd-s-failed .pd-flownum {
        border-color: #e7674a66;
        color: #e7674a;
    }
    .pd-flowbody {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
        flex: 1;
    }
    .pd-flowtitle {
        font-size: 14px;
        color: var(--text);
        line-height: 1.3;
    }
    .pd-flowmeta {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        color: var(--text-faint);
    }
    .pd-flowarrow {
        flex-shrink: 0;
        color: var(--text-faint);
        font-size: 15px;
    }
    .pd-flowbtn:hover .pd-flowarrow {
        color: rgb(var(--holo));
    }

    /* Chips (artifacts + step output) */
    .pd-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }
    .pd-chip {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 8px 13px;
        border-radius: 9px;
        border: 1px solid rgb(var(--holo) / 0.2);
        background: rgb(var(--holo) / 0.05);
        color: var(--text);
        font-size: 12.5px;
        cursor: pointer;
        transition:
            background 0.12s,
            border-color 0.12s;
    }
    .pd-chip:hover {
        background: rgb(var(--holo) / 0.12);
        border-color: rgb(var(--holo) / 0.4);
    }
    .pd-chip-star {
        border-color: rgb(var(--holo) / 0.45);
        background: rgb(var(--holo) / 0.1);
        font-weight: 600;
    }
    .pd-chipstar {
        color: rgb(var(--holo));
    }
    .pd-chipnum {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--text-faint);
    }

    /* Step header */
    .pd-dhead {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-shrink: 0;
        margin-bottom: 2px;
    }
    .pd-ddot {
        font-size: 14px;
        color: var(--text-faint);
    }
    .pd-s-running .pd-ddot {
        color: rgb(var(--holo));
    }
    .pd-s-done .pd-ddot {
        color: #4ae08a;
    }
    .pd-s-failed .pd-ddot {
        color: #e7674a;
    }
    .pd-dtitle {
        margin: 0;
        font-family: var(--font-display);
        font-size: 18px;
        font-weight: 600;
        color: var(--text);
    }
    .pd-dmeta {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--text-dim);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .pd-outbtn {
        margin-left: auto;
        padding: 7px 13px;
        border-radius: 8px;
        border: 1px solid rgb(var(--holo) / 0.35);
        background: rgb(var(--holo) / 0.08);
        color: var(--text);
        font-family: var(--font-mono);
        font-size: 11px;
        cursor: pointer;
    }
    .pd-outbtn:hover {
        background: rgb(var(--holo) / 0.16);
    }
    .pd-desc {
        margin: 0 0 6px;
        flex-shrink: 0;
        max-width: 90ch;
        font-size: 13px;
        line-height: 1.55;
        color: var(--text-dim);
    }

    /* Step trajectory: one row per tool call, with its args. */
    .pd-traj {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
    }
    .pd-trowbtn {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 11px;
        text-align: left;
        padding: 9px 12px;
        border-radius: 8px;
        border: 1px solid transparent;
        background: none;
        color: var(--text);
        cursor: pointer;
        transition:
            background 0.12s,
            border-color 0.12s;
    }
    .pd-trowbtn:hover {
        background: rgb(var(--holo) / 0.07);
        border-color: rgb(var(--holo) / 0.22);
    }
    .pd-tdot {
        flex-shrink: 0;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--text-faint);
    }
    .pd-a-running .pd-tdot {
        background: rgb(var(--holo));
    }
    .pd-a-success .pd-tdot {
        background: #4ae08a;
    }
    .pd-a-error .pd-tdot {
        background: #e7674a;
    }
    .pd-tname {
        flex-shrink: 0;
        font-size: 13px;
        font-weight: 500;
        color: var(--text);
    }
    .pd-targ {
        min-width: 0;
        flex: 1;
        font-family: var(--font-mono);
        font-size: 11.5px;
        color: var(--text-dim);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .pd-topen {
        flex-shrink: 0;
        margin-left: auto;
        font-family: var(--font-mono);
        font-size: 9.5px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-faint);
        opacity: 0;
    }
    .pd-trowbtn:hover .pd-topen {
        opacity: 1;
    }
    .pd-stream {
        flex: 1;
        min-height: 0;
        margin: 0;
        overflow-y: auto;
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
        padding: 6px 0;
    }

    /* Slideover: opaque, wide for docs. */
    .pd-scrim {
        position: fixed;
        inset: 0;
        z-index: 80;
        border: none;
        background: rgb(0 0 0 / 0.55);
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
        width: min(480px, 92vw);
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 22px 24px;
        /* Opaque: a faint holo tint composited over the solid page bg. */
        background:
            linear-gradient(rgb(var(--holo) / 0.05), rgb(var(--holo) / 0.05)),
            var(--bg, #0a0b0e);
        border-left: 1px solid rgb(var(--holo) / 0.25);
        box-shadow: -50px 0 90px -30px rgb(0 0 0 / 0.95);
        animation: pd-slidein 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .pd-slide.wide {
        width: min(800px, 94vw);
    }
    @keyframes pd-slidein {
        from {
            transform: translateX(28px);
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
        gap: 10px;
        flex-shrink: 0;
        padding-bottom: 4px;
        border-bottom: 1px solid rgb(var(--holo) / 0.12);
    }
    .pd-slide-star {
        color: rgb(var(--holo));
        font-size: 14px;
    }
    .pd-adot {
        flex-shrink: 0;
        width: 8px;
        height: 8px;
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
    .pd-slide-name {
        flex: 1;
        min-width: 0;
        font-family: var(--font-display);
        font-size: 16px;
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
        width: 28px;
        height: 28px;
        line-height: 1;
        font-size: 19px;
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
    .pd-slide-doc {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding-right: 6px;
        padding-bottom: 24px;
    }
    .pd-slide-args {
        flex-shrink: 0;
        max-height: 26vh;
        overflow-y: auto;
        margin: 0;
        padding: 11px 13px;
        border-radius: 8px;
        background: rgb(var(--holo) / 0.06);
        font-family: var(--font-mono);
        font-size: 11.5px;
        line-height: 1.5;
        color: var(--text-dim);
        white-space: pre-wrap;
        word-break: break-word;
    }
    .pd-slide-res {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding-right: 6px;
        font-family: var(--font-mono);
        font-size: 12px;
        line-height: 1.65;
        color: var(--text);
        white-space: pre-wrap;
        word-break: break-word;
    }
</style>
