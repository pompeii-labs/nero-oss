<script lang="ts">
    import '../app.css';
    import { Toaster } from '$lib/components/ui/sonner';
    import Sidebar from '$lib/components/layout/sidebar.svelte';
    import MobileNav from '$lib/components/layout/mobile-nav.svelte';
    import '../lib/audio/polyfills';

    let { children } = $props();
</script>

<svelte:head>
    <title>Nero</title>
    <meta name="description" content="AI companion with terminal, voice, and SMS interfaces" />
</svelte:head>

<div class="flex h-screen w-full bg-background">
    <div class="hidden md:flex">
        <Sidebar />
    </div>

    <div class="flex flex-1 flex-col overflow-hidden">
        <MobileNav />
        <main class="flex-1 overflow-auto">
            {@render children()}
        </main>
    </div>
</div>

<Toaster />
