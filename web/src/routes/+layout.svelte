<script lang="ts">
    import '../app.css';
    import { Toaster } from '$lib/components/ui/sonner';

    let { children } = $props();
</script>

<svelte:head>
    <title>Nero</title>
    <meta name="description" content="Personal AI companion" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
</svelte:head>

{@render children()}

<Toaster />
