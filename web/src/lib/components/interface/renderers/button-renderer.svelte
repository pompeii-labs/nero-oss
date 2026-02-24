<script lang="ts">
    import { Button } from '$lib/components/ui/button';
    import DynamicIcon from '../dynamic-icon.svelte';
    import Loader2 from '@lucide/svelte/icons/loader-2';

    let { component, disabled = false, onAction }: {
        component: any;
        disabled?: boolean;
        onAction: (action: any) => Promise<any>;
    } = $props();

    let busy = $state(false);

    async function handleClick() {
        if (busy || !component.action) return;
        busy = true;
        try {
            await onAction(component.action);
        } finally {
            busy = false;
        }
    }

    const variantMap: Record<string, 'default' | 'destructive' | 'ghost' | 'secondary'> = {
        primary: 'default',
        destructive: 'destructive',
        ghost: 'ghost',
        default: 'secondary',
    };

    const sizeMap: Record<string, 'sm' | 'default' | 'lg'> = {
        sm: 'sm',
        md: 'default',
        lg: 'lg',
    };
</script>

<Button
    variant={variantMap[component.variant || 'default'] || 'secondary'}
    size={sizeMap[component.size || 'md'] || 'default'}
    disabled={disabled || busy}
    onclick={handleClick}
    class="gap-2"
>
    {#if busy}
        <Loader2 class="h-4 w-4 animate-spin" />
    {:else if component.icon}
        <DynamicIcon name={component.icon} size={component.size === 'sm' ? 14 : component.size === 'lg' ? 20 : 16} />
    {/if}
    {component.label || ''}
</Button>
