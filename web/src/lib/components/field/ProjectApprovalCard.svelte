<script lang="ts">
    import { untrack, tick } from 'svelte';
    import type { ProjectRow, ProjectTaskRow } from '$lib/lux';

    let {
        project,
        tasks,
        onRun,
        onTweak,
        onCancel,
        placement = 'composer',
    }: {
        project: ProjectRow;
        tasks: ProjectTaskRow[];
        onRun: (budgetUsd: number) => void;
        onTweak: (note: string) => void;
        onCancel: () => void;
        placement?: 'composer' | 'rail';
    } = $props();

    const est = $derived(project.est_cost_usd ?? 0);
    const ordered = $derived([...tasks].sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0)));

    let budget = $state('');
    let tweaking = $state(false);
    let note = $state('');
    let noteEl = $state<HTMLTextAreaElement>();

    // A sensible default budget: the estimate with headroom, floored at $1.
    $effect(() => {
        project.id;
        untrack(() => {
            const e = project.est_cost_usd ?? 0;
            budget = (e > 0 ? Math.max(Math.ceil(e * 1.5 * 100) / 100, 1) : 5).toFixed(2);
            tweaking = false;
            note = '';
        });
    });

    function run() {
        const b = Number(budget);
        if (Number.isFinite(b) && b > 0) onRun(b);
    }

    async function startTweak() {
        tweaking = true;
        await tick();
        noteEl?.focus();
    }

    function sendTweak() {
        if (note.trim()) onTweak(note.trim());
    }

    function onKey(e: KeyboardEvent) {
        const typing =
            document.activeElement === noteEl ||
            (document.activeElement as HTMLElement)?.tagName === 'INPUT';
        if (tweaking) {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                sendTweak();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                tweaking = false;
            }
            return;
        }
        if (e.key === 'Enter' && !typing) {
            e.preventDefault();
            run();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
        }
    }

    function depLabel(t: ProjectTaskRow): string {
        const d = t.depends_on ?? [];
        return d.length ? `after ${d.map((i) => `#${i + 1}`).join(', ')}` : 'starts now';
    }
</script>

<svelte:window onkeydown={onKey} />

<div class="pa {placement}">
    <div class="pa-card" role="dialog" aria-label="Nero is proposing a project">
        <header class="pa-head">
            <i class="pa-dot"></i>
            <span class="pa-tag">Nero · Plan</span>
            <span class="pa-count">{ordered.length} {ordered.length === 1 ? 'task' : 'tasks'}</span>
            <button class="pa-x" title="Cancel (Esc)" onclick={onCancel}>×</button>
        </header>

        <p class="pa-title">{project.title}</p>
        {#if project.goal}<p class="pa-goal">{project.goal}</p>{/if}

        <ol class="pa-tasks">
            {#each ordered as t (t.id)}
                <li class="pa-task">
                    <span class="pa-tnum">{(t.idx ?? 0) + 1}</span>
                    <span class="pa-tbody">
                        <span class="pa-ttitle">{t.title}</span>
                        {#if t.description}<span class="pa-tdesc">{t.description}</span>{/if}
                    </span>
                    <span class="pa-tdep">{depLabel(t)}</span>
                </li>
            {/each}
        </ol>

        {#if tweaking}
            <textarea
                bind:this={noteEl}
                class="pa-note"
                bind:value={note}
                placeholder="What should change about this plan?"
                rows="2"
            ></textarea>
            <div class="pa-actions">
                <button class="pa-btn ghost" onclick={() => (tweaking = false)}>Back</button>
                <button class="pa-btn primary" onclick={sendTweak} disabled={!note.trim()}>
                    Send changes <kbd>⌘⏎</kbd>
                </button>
            </div>
        {:else}
            <div class="pa-budget">
                <span class="pa-blabel">Budget ceiling</span>
                <div class="pa-binput">
                    <span class="pa-bsign">$</span>
                    <input
                        class="pa-bfield"
                        type="number"
                        min="0"
                        step="0.5"
                        bind:value={budget}
                    />
                </div>
                <span class="pa-best">est ${est.toFixed(2)}</span>
            </div>
            <div class="pa-actions">
                <button class="pa-btn ghost" onclick={onCancel}>Cancel</button>
                <button class="pa-btn ghost" onclick={startTweak}>Tweak</button>
                <button class="pa-btn primary" onclick={run}>Run it <kbd>⏎</kbd></button>
            </div>
        {/if}

        <footer class="pa-foot">
            <span>Runs in the background</span>
            <span class="pa-foot-r">pauses at the budget · pings when done</span>
        </footer>
    </div>
</div>

<style>
    .pa {
        position: fixed;
        z-index: 60;
        pointer-events: none;
        display: flex;
    }
    /* A plan + budget is a real decision, so center it like a modal (not anchored to
     *  the composer) with a subtle focus dim. */
    .pa.composer {
        inset: 0;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgb(4 5 8 / 0.5);
        backdrop-filter: blur(2px);
    }
    .pa.rail {
        top: 0;
        bottom: 0;
        right: 24px;
        align-items: center;
    }

    .pa-card {
        pointer-events: auto;
        width: min(640px, 100%);
        max-height: 78vh;
        overflow-y: auto;
        background: var(--panel-bg);
        border: 1px solid rgb(var(--holo) / 0.3);
        border-radius: 14px;
        padding: 15px 16px 12px;
        backdrop-filter: blur(12px);
        box-shadow:
            0 0 0 1px rgb(var(--holo) / 0.08),
            0 30px 70px -24px rgb(0 0 0 / 0.9),
            0 0 50px -16px rgb(var(--holo) / 0.4);
        animation: pa-in 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .pa.rail .pa-card {
        width: 400px;
    }
    @keyframes pa-in {
        from {
            opacity: 0;
            transform: translateY(12px) scale(0.985);
        }
        to {
            opacity: 1;
            transform: none;
        }
    }

    .pa-head {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 11px;
    }
    .pa-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: rgb(var(--holo));
        box-shadow: 0 0 8px rgb(var(--holo));
    }
    .pa-tag {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--text-faint);
    }
    .pa-count {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--text-dim);
    }
    .pa-x {
        margin-left: auto;
        width: 22px;
        height: 22px;
        line-height: 1;
        font-size: 18px;
        border: none;
        background: none;
        color: var(--text-faint);
        cursor: pointer;
        border-radius: 6px;
    }
    .pa-x:hover {
        color: var(--text);
        background: rgb(var(--holo) / 0.12);
    }

    .pa-title {
        margin: 0 0 4px;
        font-family: var(--font-display);
        font-size: 19px;
        line-height: 1.25;
        color: var(--text);
    }
    .pa-goal {
        margin: 0 0 13px;
        font-size: 13px;
        line-height: 1.45;
        color: var(--text-dim);
    }

    .pa-tasks {
        list-style: none;
        margin: 0 0 13px;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .pa-task {
        display: flex;
        align-items: flex-start;
        gap: 11px;
        padding: 9px 11px;
        border-radius: 9px;
        border: 1px solid rgb(var(--holo) / 0.18);
        background: rgb(var(--holo) / 0.04);
    }
    .pa-tnum {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        display: grid;
        place-items: center;
        font-family: var(--font-mono);
        font-size: 11px;
        border-radius: 5px;
        border: 1px solid rgb(var(--holo) / 0.3);
        color: var(--text-dim);
        background: rgb(var(--holo) / 0.06);
    }
    .pa-tbody {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1;
    }
    .pa-ttitle {
        font-size: 14px;
        font-weight: 600;
        color: var(--text);
    }
    .pa-tdesc {
        font-size: 12px;
        color: var(--text-dim);
        line-height: 1.4;
    }
    .pa-tdep {
        flex-shrink: 0;
        font-family: var(--font-mono);
        font-size: 9.5px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--text-faint);
        padding-top: 3px;
    }

    .pa-budget {
        display: flex;
        align-items: center;
        gap: 11px;
        padding: 10px 12px;
        border-radius: 9px;
        border: 1px solid rgb(var(--holo) / 0.2);
        background: rgb(var(--holo) / 0.05);
        margin-bottom: 11px;
    }
    .pa-blabel {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--text-dim);
    }
    .pa-binput {
        display: flex;
        align-items: center;
        gap: 2px;
        margin-left: auto;
        border-bottom: 1px solid rgb(var(--holo) / 0.4);
        padding-bottom: 1px;
    }
    .pa-bsign {
        color: var(--text-dim);
        font-size: 15px;
    }
    .pa-bfield {
        width: 72px;
        border: none;
        background: none;
        color: var(--text);
        font-size: 16px;
        font-family: var(--font-mono);
        outline: none;
    }
    .pa-best {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--text-faint);
    }

    .pa-note {
        width: 100%;
        box-sizing: border-box;
        resize: vertical;
        border-radius: 9px;
        border: 1px solid rgb(var(--holo) / 0.3);
        background: rgb(var(--holo) / 0.04);
        color: var(--text);
        font-family: inherit;
        font-size: 13px;
        padding: 9px 11px;
        outline: none;
        margin-bottom: 10px;
    }
    .pa-note:focus {
        border-color: rgb(var(--holo) / 0.6);
    }

    .pa-actions {
        display: flex;
        gap: 8px;
    }
    .pa-btn {
        padding: 9px 14px;
        border-radius: 9px;
        font-family: var(--font-mono);
        font-size: 12px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        cursor: pointer;
    }
    .pa-btn.ghost {
        border: 1px solid rgb(var(--holo) / 0.22);
        background: none;
        color: var(--text-dim);
    }
    .pa-btn.ghost:hover {
        background: rgb(var(--holo) / 0.08);
        color: var(--text);
    }
    .pa-btn.primary {
        margin-left: auto;
        border: 1px solid rgb(var(--holo) / 0.6);
        background: rgb(var(--holo) / 0.2);
        color: var(--text);
    }
    .pa-btn.primary:hover {
        background: rgb(var(--holo) / 0.3);
    }
    .pa-btn.primary:disabled {
        opacity: 0.4;
        cursor: default;
    }
    .pa-btn kbd {
        font-family: var(--font-mono);
        margin-left: 4px;
    }

    .pa-foot {
        display: flex;
        gap: 12px;
        margin-top: 11px;
        padding-top: 9px;
        border-top: 1px solid rgb(var(--holo) / 0.1);
        font-family: var(--font-mono);
        font-size: 9.5px;
        letter-spacing: 0.06em;
        color: var(--text-faint);
        text-transform: uppercase;
    }
    .pa-foot-r {
        margin-left: auto;
    }
</style>
