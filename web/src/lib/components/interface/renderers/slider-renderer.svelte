<script lang="ts">
    import { Label } from '$lib/components/ui/label';

    let { component, value = 0, disabled = false, onAction }: {
        component: any;
        value?: number;
        disabled?: boolean;
        onAction: (action: any) => Promise<any>;
    } = $props();

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    function handleInput(e: Event) {
        const target = e.target as HTMLInputElement;
        const newValue = parseFloat(target.value);
        onAction({ type: 'update', stateKey: component.stateKey, value: newValue });

        if (component.action) {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                onAction(component.action);
            }, 300);
        }
    }

    let percent = $derived(((value - component.min) / (component.max - component.min)) * 100);
</script>

<div class="space-y-2 py-1">
    <div class="flex items-center justify-between">
        <Label class="text-sm text-foreground/80 font-normal">{component.label}</Label>
        <span class="text-xs font-mono text-muted-foreground">{value}</span>
    </div>
    <input
        type="range"
        min={component.min}
        max={component.max}
        step={component.step || 1}
        {value}
        {disabled}
        oninput={handleInput}
        class="slider-range w-full h-1.5 rounded-full appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        style="background: linear-gradient(to right, var(--primary) 0%, var(--primary) {percent}%, var(--input) {percent}%, var(--input) 100%);"
    />
</div>

<style>
    .slider-range::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--foreground);
        cursor: pointer;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
    }
    .slider-range::-moz-range-thumb {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--foreground);
        cursor: pointer;
        border: none;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
    }
</style>
