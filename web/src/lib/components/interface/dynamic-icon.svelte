<script lang="ts">
    import { icons } from '@lucide/svelte';
    import type { Component } from 'svelte';

    let { name, size = 24, color = 'currentColor', class: className = '' }: {
        name: string;
        size?: number;
        color?: string;
        class?: string;
    } = $props();

    function toComponentName(kebab: string): string {
        return kebab
            .split('-')
            .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
            .join('');
    }

    let IconComponent = $derived((icons as Record<string, Component>)[toComponentName(name)]);
</script>

{#if IconComponent}
    <IconComponent {size} {color} class={className} />
{/if}
