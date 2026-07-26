<script lang="ts">
    import { fieldTheme, FIELD_THEMES } from '$lib/stores/field-theme.svelte';
    import Sun from '@lucide/svelte/icons/sun';
    import Moon from '@lucide/svelte/icons/moon';

    // Cmd/Ctrl+Shift+L toggles day/night.
    $effect(() => {
        function onKey(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'l' || e.key === 'L')) {
                e.preventDefault();
                fieldTheme.toggleMode();
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });
</script>

<nav class="switch">
    {#each FIELD_THEMES as t}
        <button
            type="button"
            class="opt"
            class:on={fieldTheme.value === t.id}
            onclick={() => fieldTheme.set(t.id)}
        >
            {t.label}
        </button>
    {/each}
    <span class="sep"></span>
    <button
        type="button"
        class="mode"
        onclick={() => fieldTheme.toggleMode()}
        title="Day / night (⌘⇧L)"
        aria-label="Toggle day or night"
    >
        {#if fieldTheme.mode === 'day'}<Sun size={13} />{:else}<Moon size={13} />{/if}
    </button>
</nav>

<style>
    .switch {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px;
        border-radius: 999px;
        background: var(--glass-tint);
        border: 1px solid var(--glass-edge);
        backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
        -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
        box-shadow:
            inset 0 1px 0 var(--glass-hi),
            0 8px 22px -12px rgb(0 0 0 / 0.8);
    }
    .opt {
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.06em;
        color: var(--text-dim);
        background: none;
        border: none;
        cursor: pointer;
        padding: 6px 14px;
        border-radius: 999px;
        transition: color 0.2s, background 0.2s;
    }
    .opt:hover {
        color: var(--text);
    }
    .opt.on {
        color: var(--void);
        background: linear-gradient(180deg, rgb(var(--holo-soft)), rgb(var(--holo)));
        box-shadow: 0 0 16px -2px rgb(var(--holo) / 0.5);
    }
    .sep {
        width: 1px;
        height: 16px;
        background: rgb(var(--holo) / 0.16);
        margin: 0 2px;
    }
    .mode {
        display: grid;
        place-items: center;
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 999px;
        background: none;
        color: var(--text-dim);
        cursor: pointer;
        transition: color 0.2s, background 0.2s;
    }
    .mode:hover {
        color: var(--text);
        background: rgb(var(--holo) / 0.1);
    }
</style>
