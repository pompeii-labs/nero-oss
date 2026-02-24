<script lang="ts">
    import InterfaceRenderer from '../interface-renderer.svelte';

    let { component, state = {}, onAction }: {
        component: any;
        state?: Record<string, any>;
        onAction: (action: any) => Promise<any>;
    } = $props();
</script>

<div
    class="grid"
    style="grid-template-columns: repeat({component.columns}, 1fr); gap: {component.gap ?? 8}px;"
>
    <InterfaceRenderer components={component.children || []} {state} {onAction} />
</div>
