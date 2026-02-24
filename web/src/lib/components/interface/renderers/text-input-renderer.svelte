<script lang="ts">
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import Loader2 from '@lucide/svelte/icons/loader-2';

    let { component, value = '', disabled = false, onAction }: {
        component: any;
        value?: string;
        disabled?: boolean;
        onAction: (action: any) => Promise<any>;
    } = $props();

    let busy = $state(false);

    function handleInput(e: Event) {
        const target = e.target as HTMLInputElement;
        onAction({ type: 'update', stateKey: component.stateKey, value: target.value });
    }

    async function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' && component.action && !busy) {
            busy = true;
            try {
                await onAction(component.action);
            } finally {
                busy = false;
            }
        }
    }
</script>

<div class="space-y-1.5 py-1">
    {#if component.label}
        <Label class="text-sm text-foreground/80">{component.label}</Label>
    {/if}
    <div class="relative">
        <Input
            {value}
            {disabled}
            placeholder={component.placeholder || ''}
            oninput={handleInput}
            onkeydown={handleKeydown}
        />
        {#if busy}
            <div class="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
        {/if}
    </div>
</div>
