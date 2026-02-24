<script lang="ts">
    let { component }: {
        component: any;
    } = $props();

    let errored = $state(false);
</script>

{#if !errored}
    <img
        src={component.src}
        alt={component.alt || ''}
        loading="lazy"
        onerror={() => errored = true}
        class="w-full"
        style="object-fit: {component.fit || 'cover'}; {component.height ? `height: ${component.height}px;` : ''} border-radius: {component.borderRadius ?? 8}px;"
    />
{/if}
