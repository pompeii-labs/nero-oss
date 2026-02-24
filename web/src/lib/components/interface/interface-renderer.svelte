<script lang="ts">
    import ButtonRenderer from './renderers/button-renderer.svelte';
    import ToggleRenderer from './renderers/toggle-renderer.svelte';
    import SliderRenderer from './renderers/slider-renderer.svelte';
    import TextRenderer from './renderers/text-renderer.svelte';
    import TextInputRenderer from './renderers/text-input-renderer.svelte';
    import SelectRenderer from './renderers/select-renderer.svelte';
    import ImageRenderer from './renderers/image-renderer.svelte';
    import ProgressRenderer from './renderers/progress-renderer.svelte';
    import ListRenderer from './renderers/list-renderer.svelte';
    import SeparatorRenderer from './renderers/separator-renderer.svelte';
    import GridRenderer from './renderers/grid-renderer.svelte';
    import FlexRenderer from './renderers/flex-renderer.svelte';
    import DynamicIcon from './dynamic-icon.svelte';

    let { components, state = {}, onAction }: {
        components: any[];
        state?: Record<string, any>;
        onAction: (action: any) => Promise<any>;
    } = $props();

    function resolveRef(value: any, localState: Record<string, any>): any {
        if (typeof value === 'string' && value.startsWith('$state.')) {
            const key = value.slice(7);
            return localState[key];
        }
        return value;
    }

    function isVisible(component: any, localState: Record<string, any>): boolean {
        if (component.visible === undefined) return true;
        const resolved = resolveRef(component.visible, localState);
        return !!resolved;
    }

    function isDisabled(component: any, localState: Record<string, any>): boolean {
        if (component.disabled === undefined) return false;
        const resolved = resolveRef(component.disabled, localState);
        return !!resolved;
    }
</script>

{#each components as component, i (component.id)}
    {#if isVisible(component, state)}
        <div class="component-enter" style="animation-delay: {Math.min(i * 0.04, 0.3)}s">
            {#if component.type === 'button'}
                <ButtonRenderer {component} disabled={isDisabled(component, state)} {onAction} />
            {:else if component.type === 'toggle'}
                <ToggleRenderer
                    {component}
                    checked={!!state[component.stateKey]}
                    disabled={isDisabled(component, state)}
                    {onAction}
                />
            {:else if component.type === 'slider'}
                <SliderRenderer
                    {component}
                    value={state[component.stateKey] ?? component.min}
                    disabled={isDisabled(component, state)}
                    {onAction}
                />
            {:else if component.type === 'text'}
                <TextRenderer {component} resolvedContent={String(resolveRef(component.content, state) ?? '')} />
            {:else if component.type === 'text-input'}
                <TextInputRenderer
                    {component}
                    value={state[component.stateKey] ?? ''}
                    disabled={isDisabled(component, state)}
                    {onAction}
                />
            {:else if component.type === 'select'}
                <SelectRenderer
                    {component}
                    value={state[component.stateKey] ?? ''}
                    disabled={isDisabled(component, state)}
                    {onAction}
                />
            {:else if component.type === 'image'}
                <ImageRenderer {component} />
            {:else if component.type === 'progress'}
                <ProgressRenderer {component} resolvedValue={Number(resolveRef(component.value, state) ?? 0)} />
            {:else if component.type === 'list'}
                <ListRenderer {component} {state} {onAction} />
            {:else if component.type === 'separator'}
                <SeparatorRenderer />
            {:else if component.type === 'grid'}
                <GridRenderer {component} {state} {onAction} />
            {:else if component.type === 'flex'}
                <FlexRenderer {component} {state} {onAction} />
            {:else if component.type === 'icon'}
                <DynamicIcon
                    name={component.name}
                    size={component.size || 24}
                    color={component.color || 'currentColor'}
                />
            {/if}
        </div>
    {/if}
{/each}

<style>
    .component-enter {
        animation: componentIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
    }

    @keyframes componentIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
    }
</style>
