<script lang="ts">
    import InterfaceRenderer from '../interface-renderer.svelte';

    let { component, state = {}, onAction }: {
        component: any;
        state?: Record<string, any>;
        onAction: (action: any) => Promise<any>;
    } = $props();

    let variant = $derived(component.variant || 'unordered');
</script>

{#if variant === 'ordered'}
    <ol class="pl-5 list-decimal marker:text-foreground/30 space-y-1">
        {#each component.items || [] as item, i (i)}
            <li class="text-sm text-foreground/80">
                {#if typeof item === 'string'}
                    {item}
                {:else}
                    <InterfaceRenderer components={[item]} {state} {onAction} />
                {/if}
            </li>
        {/each}
    </ol>
{:else if variant === 'unordered'}
    <ul class="pl-5 list-disc marker:text-foreground/30 space-y-1">
        {#each component.items || [] as item, i (i)}
            <li class="text-sm text-foreground/80">
                {#if typeof item === 'string'}
                    {item}
                {:else}
                    <InterfaceRenderer components={[item]} {state} {onAction} />
                {/if}
            </li>
        {/each}
    </ul>
{:else}
    <div class="space-y-1">
        {#each component.items || [] as item, i (i)}
            <div class="text-sm text-foreground/80">
                {#if typeof item === 'string'}
                    {item}
                {:else}
                    <InterfaceRenderer components={[item]} {state} {onAction} />
                {/if}
            </div>
        {/each}
    </div>
{/if}
