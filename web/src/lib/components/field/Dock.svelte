<script lang="ts">
    // The input dock. Glass slab, holographic focus glow, mic affordance.
    let {
        placeholder = 'Message Nero',
        value = $bindable(''),
    }: { placeholder?: string; value?: string } = $props();
</script>

<div class="dock">
    <div class="input">
        <span class="prompt">›</span>
        <input bind:value type="text" {placeholder} />
        <span class="mic"></span>
    </div>
</div>

<style>
    .dock {
        width: min(540px, 70vw);
    }
    .input {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 18px;
        border-radius: 14px;
        background: linear-gradient(180deg, rgb(var(--void) / 0) 0%, rgb(0 0 0 / 0.35) 100%), var(--panel-bg);
        border: 1px solid rgb(var(--holo) / 0.2);
        backdrop-filter: blur(11px);
        box-shadow:
            inset 0 1px 0 rgb(var(--metal-hi) / 0.16),
            0 0 40px -12px rgb(var(--holo) / 0.22),
            0 18px 40px -18px rgb(0 0 0 / 0.9);
        transition: border-color 0.25s, box-shadow 0.25s;
    }
    .input:focus-within {
        border-color: rgb(var(--holo) / 0.4);
        box-shadow:
            inset 0 1px 0 rgb(var(--metal-hi) / 0.18),
            0 0 50px -10px rgb(var(--holo) / 0.35),
            0 18px 40px -18px rgb(0 0 0 / 0.9);
    }
    .prompt {
        font-family: var(--font-mono);
        color: rgb(var(--holo));
        font-size: 15px;
    }
    input {
        flex: 1;
        background: none;
        border: none;
        outline: none;
        color: var(--text);
        font-family: var(--font-ui);
        font-size: 14px;
    }
    input::placeholder {
        color: var(--text-faint);
    }
    .mic {
        width: 16px;
        height: 16px;
        border-radius: 4px;
        border: 1.5px solid var(--text-dim);
        position: relative;
        flex-shrink: 0;
    }
    .mic::after {
        content: '';
        position: absolute;
        inset: 3px;
        border-radius: 2px;
        background: rgb(var(--holo));
        box-shadow: 0 0 8px rgb(var(--holo));
    }
</style>
