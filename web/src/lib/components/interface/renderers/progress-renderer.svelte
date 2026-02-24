<script lang="ts">
    import { Label } from '$lib/components/ui/label';

    let { component, resolvedValue = 0 }: {
        component: any;
        resolvedValue?: number;
    } = $props();

    let max = $derived(component.max ?? 100);
    let percent = $derived(Math.min(Math.max((resolvedValue / max) * 100, 0), 100));
</script>

<div class="space-y-1.5 py-1">
    {#if component.label}
        <div class="flex items-center justify-between">
            <Label class="text-sm text-foreground/80 font-normal">{component.label}</Label>
            <span class="text-xs font-mono text-muted-foreground">{resolvedValue}/{max}</span>
        </div>
    {/if}
    <div class="w-full h-2 rounded-full bg-secondary overflow-hidden">
        <div
            class="h-full rounded-full transition-all duration-500"
            style="width: {percent}%; background: {component.color || 'var(--primary)'};"
        ></div>
    </div>
</div>
