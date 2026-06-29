<script lang="ts">
    import { untrack, tick } from 'svelte';
    import type { QuestionRow } from '$lib/lux';

    let {
        question,
        onAnswer,
        onDismiss,
        placement = 'composer',
    }: {
        question: QuestionRow;
        onAnswer: (answers: string[][]) => void;
        onDismiss: () => void;
        placement?: 'composer' | 'rail';
    } = $props();

    const items = $derived(question.items ?? []);

    let qi = $state(0); // current question index
    let reviewing = $state(false); // on the final submit/review screen
    let selections = $state<string[][]>([]); // chosen labels per question
    let others = $state<string[]>([]); // free-text per question
    let highlight = $state(0); // highlighted row (0..optsLen, optsLen = the "other" row)
    let otherFocused = $state(false);
    let otherEl = $state<HTMLInputElement>();

    // Reset whenever a new ask arrives.
    $effect(() => {
        question.id;
        untrack(() => {
            selections = items.map(() => []);
            others = items.map(() => '');
            qi = 0;
            highlight = 0;
            reviewing = false;
            otherFocused = false;
        });
    });

    const item = $derived(items[qi]);
    const opts = $derived(item?.options ?? []);
    const otherRow = $derived(opts.length);
    const single = $derived(items.length === 1 && !item?.multi);

    function isPicked(label: string) {
        return selections[qi]?.includes(label) ?? false;
    }

    function pickOption(idx: number) {
        const label = opts[idx]?.label;
        if (!label) return;
        otherFocused = false;
        if (item.multi) {
            const cur = new Set(selections[qi] ?? []);
            cur.has(label) ? cur.delete(label) : cur.add(label);
            selections[qi] = [...cur];
            selections = [...selections];
        } else {
            selections[qi] = [label];
            others[qi] = '';
            selections = [...selections];
            others = [...others];
            goNext();
        }
    }

    function onOtherInput(e: Event) {
        const text = (e.target as HTMLInputElement).value;
        others[qi] = text;
        others = [...others];
        selections[qi] = text.trim() ? [text.trim()] : [];
        selections = [...selections];
    }

    async function focusOther() {
        otherFocused = true;
        highlight = otherRow;
        await tick();
        otherEl?.focus();
    }

    function goNext() {
        otherFocused = false;
        if (single) return submit();
        if (qi < items.length - 1) {
            qi++;
            highlight = 0;
        } else {
            reviewing = true;
        }
    }
    function goPrev() {
        otherFocused = false;
        if (reviewing) {
            reviewing = false;
            qi = items.length - 1;
            highlight = 0;
        } else if (qi > 0) {
            qi--;
            highlight = 0;
        }
    }

    function submit() {
        onAnswer(selections.map((s) => s ?? []));
    }

    function onKey(e: KeyboardEvent) {
        if (otherFocused) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (others[qi]?.trim()) goNext();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                otherFocused = false;
                otherEl?.blur();
            }
            return; // let the rest type into the input
        }

        if (reviewing) {
            if (e.key === 'Enter') {
                e.preventDefault();
                submit();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                goPrev();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onDismiss();
            }
            return;
        }

        const n = parseInt(e.key, 10);
        if (!Number.isNaN(n) && n >= 1 && n <= opts.length) {
            e.preventDefault();
            pickOption(n - 1);
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                highlight = Math.min(otherRow, highlight + 1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                highlight = Math.max(0, highlight - 1);
                break;
            case 'ArrowRight':
                e.preventDefault();
                goNext();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                goPrev();
                break;
            case 'Enter':
                e.preventDefault();
                if (highlight === otherRow) void focusOther();
                else pickOption(highlight);
                break;
            case 'Escape':
                e.preventDefault();
                onDismiss();
                break;
            default:
                if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
                    e.preventDefault();
                    others[qi] = (others[qi] ?? '') + e.key;
                    others = [...others];
                    selections[qi] = [others[qi].trim()];
                    selections = [...selections];
                    void focusOther();
                }
        }
    }

    const answeredCount = $derived(selections.filter((s) => s && s.length).length);
</script>

<svelte:window onkeydown={onKey} />

<div class="ask {placement}">
    <div class="ask-card" role="dialog" aria-label="Nero is asking">
        <header class="ask-head">
            <i class="ask-dot"></i>
            {#if reviewing}
                <span class="ask-chip">Review</span>
            {:else if item?.header}
                <span class="ask-chip">{item.header}</span>
            {/if}
            <span class="ask-tag">Nero asks</span>
            {#if items.length > 1}
                <span class="ask-count"
                    >{reviewing ? items.length : qi + 1}/{items.length}</span
                >
            {/if}
            <button class="ask-x" title="Dismiss (Esc)" onclick={onDismiss}>×</button>
        </header>

        {#if reviewing}
            <p class="ask-q">Submit your answers?</p>
            <div class="ask-review">
                {#each items as it, i}
                    <button class="ask-rev" onclick={() => ((reviewing = false), (qi = i))}>
                        <span class="ask-rev-q">{it.question}</span>
                        <span class="ask-rev-a"
                            >{selections[i]?.length ? selections[i].join(', ') : '—'}</span
                        >
                    </button>
                {/each}
            </div>
            <button class="ask-submit" onclick={submit}>Submit <kbd>⏎</kbd></button>
        {:else if item}
            <p class="ask-q">{item.question}</p>
            <div class="ask-opts">
                {#each opts as opt, i (opt.label)}
                    <button
                        class="ask-opt"
                        class:hl={highlight === i}
                        class:picked={isPicked(opt.label)}
                        onmouseenter={() => (highlight = i)}
                        onclick={() => pickOption(i)}
                    >
                        <kbd class="ask-num">{i + 1}</kbd>
                        <span class="ask-opt-body">
                            <span class="ask-opt-label">{opt.label}</span>
                            {#if opt.description}<span class="ask-opt-desc">{opt.description}</span
                                >{/if}
                        </span>
                    </button>
                {/each}

                <div
                    class="ask-opt ask-other"
                    class:hl={highlight === otherRow}
                    class:picked={otherFocused && (others[qi]?.trim().length ?? 0) > 0}
                >
                    <kbd class="ask-num">↳</kbd>
                    <input
                        bind:this={otherEl}
                        class="ask-other-input"
                        placeholder="Something else…"
                        value={others[qi] ?? ''}
                        oninput={onOtherInput}
                        onfocus={() => ((otherFocused = true), (highlight = otherRow))}
                        onblur={() => (otherFocused = false)}
                    />
                </div>
            </div>

            {#if item.multi}
                <button class="ask-submit" onclick={goNext}>
                    {qi < items.length - 1 ? 'Next' : 'Review'} <kbd>→</kbd>
                </button>
            {/if}
        {/if}

        <footer class="ask-foot">
            <span><kbd>1</kbd>–<kbd>{opts.length || 1}</kbd> pick</span>
            <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
            {#if items.length > 1}<span><kbd>←</kbd><kbd>→</kbd> question</span>{/if}
            <span class="ask-foot-type">type for something else</span>
        </footer>
    </div>
</div>

<style>
    .ask {
        position: fixed;
        z-index: 60;
        pointer-events: none;
        display: flex;
    }
    /* Replaces the composer along the bottom. */
    .ask.composer {
        left: 0;
        right: 0;
        bottom: 22px;
        justify-content: center;
        padding: 0 16px;
    }
    /* Voice mode: a right rail that never covers the orb. */
    .ask.rail {
        top: 0;
        bottom: 0;
        right: 24px;
        align-items: center;
    }

    .ask-card {
        pointer-events: auto;
        width: min(620px, 100%);
        background: var(--panel-bg);
        border: 1px solid rgb(var(--holo) / 0.3);
        border-radius: 14px;
        padding: 15px 16px 12px;
        backdrop-filter: blur(12px);
        box-shadow:
            0 0 0 1px rgb(var(--holo) / 0.08),
            0 30px 70px -24px rgb(0 0 0 / 0.9),
            0 0 50px -16px rgb(var(--holo) / 0.4);
        animation: ask-in 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .ask.rail .ask-card {
        width: 380px;
    }
    @keyframes ask-in {
        from {
            opacity: 0;
            transform: translateY(12px) scale(0.985);
        }
        to {
            opacity: 1;
            transform: none;
        }
    }

    .ask-head {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 11px;
    }
    .ask-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: rgb(var(--holo));
        box-shadow: 0 0 8px rgb(var(--holo));
    }
    .ask-chip {
        font-family: var(--font-mono);
        font-size: 9.5px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--text);
        background: rgb(var(--holo) / 0.14);
        border: 1px solid rgb(var(--holo) / 0.3);
        padding: 2px 7px;
        border-radius: 999px;
    }
    .ask-tag {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--text-faint);
    }
    .ask-count {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--text-dim);
    }
    .ask-x {
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
    .ask-x:hover {
        color: var(--text);
        background: rgb(var(--holo) / 0.12);
    }
    .ask-q {
        margin: 0 0 12px;
        font-family: var(--font-display);
        font-size: 17px;
        line-height: 1.35;
        color: var(--text);
    }
    .ask-opts {
        display: flex;
        flex-direction: column;
        gap: 7px;
    }
    .ask-opt {
        display: flex;
        align-items: center;
        gap: 11px;
        text-align: left;
        padding: 10px 12px;
        border-radius: 9px;
        border: 1px solid rgb(var(--holo) / 0.2);
        background: rgb(var(--holo) / 0.04);
        color: var(--text);
        cursor: pointer;
        transition:
            background 0.12s ease,
            border-color 0.12s ease;
    }
    .ask-opt.hl {
        background: rgb(var(--holo) / 0.13);
        border-color: rgb(var(--holo) / 0.55);
    }
    .ask-opt.picked {
        background: rgb(var(--holo) / 0.2);
        border-color: rgb(var(--holo) / 0.7);
    }
    .ask-num {
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
    .ask-opt-body {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
    }
    .ask-opt-label {
        font-size: 14px;
        font-weight: 600;
    }
    .ask-opt-desc {
        font-size: 12px;
        color: var(--text-dim);
        line-height: 1.35;
    }
    .ask-other-input {
        flex: 1;
        border: none;
        background: none;
        color: var(--text);
        font-size: 13.5px;
        font-family: inherit;
        outline: none;
        padding: 1px 0;
    }
    .ask-other-input::placeholder {
        color: var(--text-faint);
    }

    .ask-review {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .ask-rev {
        display: flex;
        flex-direction: column;
        gap: 2px;
        text-align: left;
        padding: 8px 11px;
        border-radius: 8px;
        border: 1px solid rgb(var(--holo) / 0.16);
        background: none;
        cursor: pointer;
    }
    .ask-rev:hover {
        background: rgb(var(--holo) / 0.08);
    }
    .ask-rev-q {
        font-size: 11px;
        color: var(--text-dim);
    }
    .ask-rev-a {
        font-size: 14px;
        font-weight: 600;
        color: var(--text);
    }

    .ask-submit {
        margin-top: 11px;
        width: 100%;
        padding: 9px;
        border-radius: 9px;
        border: 1px solid rgb(var(--holo) / 0.55);
        background: rgb(var(--holo) / 0.18);
        color: var(--text);
        font-family: var(--font-mono);
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        cursor: pointer;
    }

    .ask-foot {
        display: flex;
        flex-wrap: wrap;
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
    .ask-foot-type {
        margin-left: auto;
    }
    .ask-foot kbd,
    .ask-submit kbd,
    .ask-num {
        font-family: var(--font-mono);
    }
    .ask-foot kbd {
        padding: 1px 4px;
        border: 1px solid rgb(var(--holo) / 0.25);
        border-radius: 4px;
        color: var(--text-dim);
    }
</style>
