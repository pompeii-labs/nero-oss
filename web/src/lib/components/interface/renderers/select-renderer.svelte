<script lang="ts">
    import { Label } from '$lib/components/ui/label';
    import ChevronDown from '@lucide/svelte/icons/chevron-down';

    let { component, value = '', disabled = false, onAction }: {
        component: any;
        value?: string;
        disabled?: boolean;
        onAction: (action: any) => Promise<any>;
    } = $props();

    function handleChange(e: Event) {
        const target = e.target as HTMLSelectElement;
        onAction({ type: 'update', stateKey: component.stateKey, value: target.value });
        if (component.action) {
            onAction(component.action);
        }
    }
</script>

<div class="space-y-1.5 py-1">
    {#if component.label}
        <Label class="text-sm text-foreground/80">{component.label}</Label>
    {/if}
    <div class="relative">
        <select
            {value}
            {disabled}
            onchange={handleChange}
            class="flex h-9 w-full min-w-0 appearance-none rounded-md border border-input bg-background px-3 py-1 pr-9 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 cursor-pointer"
        >
            {#each component.options || [] as opt}
                <option value={opt.value} selected={opt.value === value}>{opt.label}</option>
            {/each}
        </select>
        <div class="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
            <ChevronDown class="h-4 w-4" />
        </div>
    </div>
</div>
