<script lang="ts">
    import InterfaceRenderer from '../interface-renderer.svelte';

    let { component, state = {}, onAction }: {
        component: any;
        state?: Record<string, any>;
        onAction: (action: any) => Promise<any>;
    } = $props();

    const alignMap: Record<string, string> = {
        start: 'flex-start',
        center: 'center',
        end: 'flex-end',
        stretch: 'stretch',
    };

    const justifyMap: Record<string, string> = {
        start: 'flex-start',
        center: 'center',
        end: 'flex-end',
        between: 'space-between',
    };
</script>

<div
    class="flex"
    style="flex-direction: {component.direction || 'column'}; gap: {component.gap ?? 8}px; align-items: {alignMap[component.align || 'stretch']}; justify-content: {justifyMap[component.justify || 'start']};"
>
    <InterfaceRenderer components={component.children || []} {state} {onAction} />
</div>
