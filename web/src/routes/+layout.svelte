<script lang="ts">
    import '../app.css';
    import '$lib/design/layout.css';
    // The token layer belongs to every route, not just the Field. Imported per-page it
    // wasn't guaranteed to be present on a direct navigation to a sub-route.
    import '$lib/design/themes.css';
    import { onMount } from 'svelte';
    import { Toaster } from '$lib/components/ui/sonner';

    let { children } = $props();

    // Lock --app-h to the real visible height. visualViewport is the only source
    // that reflects the mobile URL bar AND the on-screen keyboard, so fixed
    // bottom-docked UI (the composer) never gets cropped.
    onMount(() => {
        const vv = window.visualViewport;
        if (!vv) return;
        const sync = () => document.documentElement.style.setProperty('--app-h', `${vv.height}px`);
        sync();
        vv.addEventListener('resize', sync);
        return () => vv.removeEventListener('resize', sync);
    });
</script>

<svelte:head>
    <title>Nero</title>
    <meta name="description" content="Personal AI companion" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
</svelte:head>

{@render children()}

<Toaster />
