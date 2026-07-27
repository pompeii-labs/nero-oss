<script lang="ts">
    // Binding a dial slot. Two ways in: pick a template from the catalogue and fill
    // its params, or describe what you want and let Nero author it.
    //
    // Templates whose secret isn't set still show, greyed, naming what they need —
    // hiding them would make the integration invisible until you'd already set up a
    // key you had no reason to know about.
    import { dialIcon } from './dial-icons';
    import {
        loadCatalog,
        bindTemplate,
        listActions,
        assignAction,
        deleteAction,
        type ActionTemplate,
        type ActionProvider,
        type DialAction,
    } from '$lib/actions/dial';

    let {
        open = false,
        slot = 0,
        onBound,
        onCompose,
        onClose,
    }: {
        open?: boolean;
        slot?: number;
        /** A template was bound; the Field should reload its actions. */
        onBound: () => void;
        /** Hand the description to Nero instead. */
        onCompose: (slot: number, text: string) => void;
        onClose: () => void;
    } = $props();

    let templates = $state<ActionTemplate[]>([]);
    let library = $state<DialAction[]>([]);
    let providers = $state<ActionProvider[]>([]);
    let loading = $state(true);
    let picked = $state<ActionTemplate | null>(null);
    let values = $state<Record<string, string>>({});
    let label = $state('');
    let describe = $state('');
    let busy = $state(false);
    let err = $state('');
    /** The + in the header swaps the sheet over to a single describe field. */
    let describing = $state(false);

    const SLOT_NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

    const grouped = $derived(
        providers
            .map((p) => ({ provider: p, items: templates.filter((t) => t.provider === p.id) }))
            .filter((g) => g.items.length),
    );

    $effect(() => {
        if (!open) {
            picked = null;
            describing = false;
            describe = '';
            err = '';
            return;
        }
        loading = true;
        void Promise.all([loadCatalog(), listActions()]).then(([c, actions]) => {
            templates = c.templates;
            providers = c.providers;
            library = actions;
            loading = false;
        });
    });

    function pick(t: ActionTemplate) {
        picked = t;
        label = t.label;
        err = '';
        values = Object.fromEntries(t.params.map((p) => [p.key, p.default ?? '']));
    }

    async function bind() {
        if (!picked || busy) return;
        busy = true;
        err = '';
        const r = await bindTemplate({
            template: picked.id,
            slot,
            label: label.trim() || picked.label,
            params: values,
        });
        busy = false;
        if (!r.success) {
            err = r.error.message;
            return;
        }
        onBound();
        onClose();
    }

    /** What currently holds this slot, if anything. */
    const occupant = $derived(library.find((a) => a.slot === slot) ?? null);

    async function reload() {
        library = await listActions();
        onBound();
    }

    async function assign(a: DialAction) {
        busy = true;
        await assignAction(a.id, slot);
        busy = false;
        await reload();
        onClose();
    }

    async function unassign(a: DialAction) {
        busy = true;
        await assignAction(a.id, -1);
        busy = false;
        await reload();
    }

    async function remove(a: DialAction) {
        busy = true;
        await deleteAction(a.id);
        busy = false;
        await reload();
    }

    function sendToNero(e: Event) {
        e.preventDefault();
        const text = describe.trim();
        if (!text) return;
        onCompose(slot, text);
        onClose();
    }

    $effect(() => {
        if (!open) return;
        function onKey(e: KeyboardEvent) {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            if (picked) picked = null;
            else onClose();
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });
</script>

{#if open}
    <div class="scrim" role="presentation" onclick={onClose}></div>
    <div class="sheet">
        <header>
            <div>
                <h2>Bind slot {slot}</h2>
                <span class="pos">{SLOT_NAMES[slot] ?? ''}</span>
            </div>
            <div class="head-acts">
                {#if !picked && !describing}
                    <button
                        class="plus"
                        onclick={() => (describing = true)}
                        title="Describe it and let Nero build it"
                        aria-label="Describe an action"
                    >+</button>
                {/if}
                <button class="x" onclick={onClose} aria-label="Close">&times;</button>
            </div>
        </header>

        {#if describing}
            <div class="body">
                <button class="back" onclick={() => (describing = false)}>← all actions</button>
                <p class="pdesc">
                    Say what the button should do. Nero writes it, runs it until it works,
                    then binds it to slot {slot}.
                </p>
                <form class="ask" onsubmit={sendToNero}>
                    <!-- svelte-ignore a11y_autofocus -->
                    <input
                        bind:value={describe}
                        placeholder="turn the bedroom lights red"
                        spellcheck="false"
                        autofocus
                    />
                    <button type="submit" disabled={!describe.trim()}>ask</button>
                </form>
            </div>
        {:else if picked}
            {@const Icon = dialIcon(picked.icon)}
            <div class="body">
                <button class="back" onclick={() => (picked = null)}>← all actions</button>

                <div class="chosen">
                    <span class="ico"><Icon size={16} strokeWidth={1.7} /></span>
                    <div>
                        <strong>{picked.label}</strong>
                        <p>{picked.description}</p>
                    </div>
                </div>

                {#if !picked.available}
                    <p class="warn">
                        Needs <code>{picked.missing.join(', ')}</code>. It'll bind anyway and
                        start working once you set that in Settings → Secrets.
                    </p>
                {/if}

                <label class="field">
                    <span>Label on the dial</span>
                    <input bind:value={label} maxlength="14" spellcheck="false" />
                </label>

                {#each picked.params as p (p.key)}
                    <label class="field">
                        <span>{p.label}{#if p.required}<i class="req">*</i>{/if}</span>
                        {#if p.options}
                            <select bind:value={values[p.key]}>
                                {#each p.options as o}<option value={o}>{o}</option>{/each}
                            </select>
                        {:else}
                            <input bind:value={values[p.key]} spellcheck="false" />
                        {/if}
                        <em>{p.description}</em>
                    </label>
                {/each}

                {#if err}<p class="err">{err}</p>{/if}

                <button class="go" onclick={bind} disabled={busy}>
                    {busy ? 'binding…' : `Bind to slot ${slot}`}
                </button>
            </div>
        {:else if loading}
            <div class="body"><p class="muted">loading actions…</p></div>
        {:else}
            <div class="body">
                {#if occupant}
                    <section class="current">
                        <h3>In this slot</h3>
                        <div class="occ">
                            <span class="occ-name">{occupant.label}</span>
                            <div class="occ-acts">
                                <button onclick={() => unassign(occupant)} disabled={busy}>
                                    unassign
                                </button>
                                <button class="danger" onclick={() => remove(occupant)} disabled={busy}>
                                    delete
                                </button>
                            </div>
                        </div>
                        <p class="pdesc">
                            Unassigning frees the slot and keeps the action in your library.
                            Deleting removes it for good.
                        </p>
                    </section>
                {/if}

                {#each grouped as g (g.provider.id)}
                    <section>
                        <h3>{g.provider.name}</h3>
                        <p class="pdesc">{g.provider.description}</p>
                        <div class="grid">
                            {#each g.items as t (t.id)}
                                {@const Icon = dialIcon(t.icon)}
                                <button
                                    class="card"
                                    class:off={!t.available}
                                    onclick={() => pick(t)}
                                    title={t.description}
                                >
                                    <span class="ico"><Icon size={15} strokeWidth={1.7} /></span>
                                    <span class="name">{t.label}</span>
                                    {#if !t.available}
                                        <span class="need">needs {t.missing.join(', ')}</span>
                                    {/if}
                                </button>
                            {/each}
                        </div>
                    </section>
                {/each}

                {#if library.filter((a) => a.slot !== slot).length}
                    <section>
                        <h3>Custom</h3>
                        <p class="pdesc">Everything you and Nero have built.</p>
                        <div class="grid">
                            {#each library.filter((a) => a.slot !== slot) as a (a.id)}
                                {@const Icon = dialIcon(a.icon)}
                                <button
                                    class="card"
                                    onclick={() => assign(a)}
                                    disabled={busy}
                                    title={a.slot >= 0 ? `currently slot ${a.slot}` : 'unassigned'}
                                >
                                    <span class="ico"><Icon size={15} strokeWidth={1.7} /></span>
                                    <span class="name">{a.label}</span>
                                    <span class="where">
                                        {a.slot >= 0 ? `slot ${a.slot}` : 'free'}
                                    </span>
                                </button>
                            {/each}
                        </div>
                    </section>
                {/if}

            </div>
        {/if}
    </div>
{/if}

<style>
    .scrim {
        position: fixed;
        inset: 0;
        z-index: 100;
        background: rgb(0 0 0 / 0.45);
        backdrop-filter: blur(2px);
    }
    .sheet {
        position: fixed;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        z-index: 101;
        width: min(520px, 94vw);
        max-height: 82vh;
        display: flex;
        flex-direction: column;
        border-radius: 20px;
        color: var(--text);
        background: var(--glass-tint);
        backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
        -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
        border: 1px solid var(--glass-edge);
        box-shadow:
            inset 0 1px 0 var(--glass-hi),
            var(--glass-lift);
        animation: in 0.24s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes in {
        from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }

    header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 18px 12px;
        border-bottom: 1px solid rgb(var(--holo) / 0.14);
    }
    h2 {
        margin: 0;
        font-family: var(--font-display);
        font-size: 19px;
        font-weight: 400;
    }
    .pos {
        font-family: var(--font-mono);
        font-size: 9px;
        letter-spacing: 0.18em;
        color: rgb(var(--holo-soft));
    }
    .head-acts {
        display: flex;
        align-items: center;
        gap: 7px;
    }
    .x,
    .plus {
        display: grid;
        place-items: center;
        width: 28px;
        height: 28px;
        font-size: 17px;
        line-height: 1;
        color: var(--text-dim);
        background: none;
        border: 1px solid rgb(var(--holo) / 0.2);
        border-radius: 8px;
        cursor: pointer;
    }
    .x:hover,
    .plus:hover {
        color: var(--text);
        border-color: rgb(var(--holo) / 0.45);
    }
    .plus {
        color: rgb(var(--holo-soft));
        font-size: 19px;
    }
    .where {
        font-family: var(--font-mono);
        font-size: 8px;
        color: var(--text-faint);
    }

    .body {
        padding: 14px 18px 18px;
        overflow-y: auto;
    }
    section + section {
        margin-top: 18px;
    }
    h3 {
        margin: 0;
        font-family: var(--font-mono);
        font-size: 9.5px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: rgb(var(--holo-soft));
    }
    .pdesc,
    .muted {
        margin: 3px 0 9px;
        font-size: 12px;
        color: var(--text-dim);
    }

    .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
        gap: 7px;
    }
    .card {
        display: grid;
        justify-items: center;
        gap: 5px;
        padding: 11px 8px;
        border-radius: 12px;
        background: rgb(var(--holo) / 0.06);
        border: 1px solid rgb(var(--holo) / 0.16);
        color: var(--text);
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
    }
    .card:hover {
        background: rgb(var(--holo) / 0.14);
        border-color: rgb(var(--holo) / 0.4);
    }
    .card.off {
        opacity: 0.5;
    }
    .name {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.08em;
    }
    .need {
        font-family: var(--font-mono);
        font-size: 8px;
        color: rgb(var(--holo2));
        text-align: center;
    }
    .ico {
        color: rgb(var(--holo-soft));
        display: grid;
        place-items: center;
    }

    .occ {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 10px;
        background: rgb(var(--holo) / 0.1);
        border: 1px solid rgb(var(--holo) / 0.28);
    }
    .occ-name {
        flex: 1;
        font-size: 13.5px;
    }
    .occ-acts {
        display: flex;
        gap: 6px;
    }
    .occ-acts button {
        font-family: var(--font-mono);
        font-size: 10px;
        padding: 5px 10px;
        border-radius: 7px;
        background: none;
        border: 1px solid rgb(var(--holo) / 0.28);
        color: var(--text-dim);
        cursor: pointer;
    }
    .occ-acts button:hover {
        color: var(--text);
    }
    .occ-acts .danger:hover {
        color: rgb(var(--bad));
        border-color: rgb(var(--bad) / 0.5);
    }

    .back {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--text-dim);
        background: none;
        border: none;
        padding: 0 0 10px;
        cursor: pointer;
    }
    .chosen {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        margin-bottom: 14px;
    }
    .chosen p {
        margin: 3px 0 0;
        font-size: 12px;
        color: var(--text-dim);
        line-height: 1.45;
    }

    .field {
        display: block;
        margin-bottom: 12px;
    }
    .field > span {
        display: block;
        font-family: var(--font-mono);
        font-size: 9.5px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--text-dim);
        margin-bottom: 4px;
    }
    .req {
        color: rgb(var(--holo2));
        font-style: normal;
    }
    .field input,
    .field select,
    .ask input {
        width: 100%;
        box-sizing: border-box;
        background: var(--sunken);
        border: 1px solid rgb(var(--holo) / 0.2);
        border-radius: 8px;
        padding: 8px 10px;
        color: var(--text);
        font-family: var(--font-ui);
        font-size: 13px;
        outline: none;
    }
    .field input:focus,
    .ask input:focus {
        border-color: rgb(var(--holo) / 0.5);
    }
    .field em {
        display: block;
        margin-top: 4px;
        font-size: 11px;
        font-style: normal;
        color: var(--text-faint);
        line-height: 1.4;
    }

    .go {
        width: 100%;
        margin-top: 4px;
        padding: 11px;
        border-radius: 10px;
        border: 1px solid rgb(var(--holo) / 0.4);
        background: rgb(var(--holo) / 0.16);
        color: rgb(var(--holo-soft));
        font-family: var(--font-mono);
        font-size: 12px;
        letter-spacing: 0.08em;
        cursor: pointer;
    }
    .go:hover:not(:disabled) {
        background: rgb(var(--holo) / 0.26);
    }
    .go:disabled {
        opacity: 0.5;
        cursor: default;
    }

    .ask {
        display: flex;
        gap: 7px;
    }
    .ask button {
        padding: 0 16px;
        border-radius: 8px;
        border: 1px solid rgb(var(--holo) / 0.3);
        background: rgb(var(--holo) / 0.12);
        color: rgb(var(--holo-soft));
        font-family: var(--font-mono);
        font-size: 11px;
        cursor: pointer;
    }
    .ask button:disabled {
        opacity: 0.4;
        cursor: default;
    }

    .warn,
    .err {
        margin: 0 0 12px;
        padding: 8px 10px;
        border-radius: 8px;
        font-size: 12px;
        line-height: 1.45;
    }
    .warn {
        background: rgb(var(--holo2) / 0.1);
        border: 1px solid rgb(var(--holo2) / 0.3);
        color: var(--text);
    }
    .err {
        background: rgb(var(--bad) / 0.12);
        border: 1px solid rgb(var(--bad) / 0.4);
        color: var(--text);
    }
    code {
        font-family: var(--font-mono);
        font-size: 11px;
        color: rgb(var(--holo2));
    }
</style>
