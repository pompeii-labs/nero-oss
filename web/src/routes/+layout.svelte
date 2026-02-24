<script lang="ts">
    import '../app.css';
    import { page } from '$app/stores';
    import { onMount, onDestroy } from 'svelte';
    import { Toaster } from '$lib/components/ui/sonner';
    import Sidebar from '$lib/components/layout/sidebar.svelte';
    import MobileNav from '$lib/components/layout/mobile-nav.svelte';
    import { interfaces } from '$lib/stores/interfaces.svelte';
    import { voice } from '$lib/stores/voice.svelte';
    import DisplayPanel from '$lib/components/interface/display-panel.svelte';
    import '../lib/audio/polyfills';

    let { children } = $props();

    let isBareRoute = $derived(
        $page.url.pathname.startsWith('/interface') || $page.url.pathname.startsWith('/display')
    );

    const mainDeviceId = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).slice(2);

    onMount(() => {
        const isBare =
            window.location.pathname.startsWith('/interface') ||
            window.location.pathname.startsWith('/display');

        if (!isBare) {
            interfaces.connectGlobalEvents(mainDeviceId, 'main');
            interfaces.setVoiceMigrateCallback((targetDevice: string) => {
                if (targetDevice !== 'main' && voice.isConnected) {
                    voice.migrateAway(targetDevice);
                } else if (targetDevice === 'main' && (voice.status === 'idle' || voice.migratedTo)) {
                    voice.connectAsTarget();
                }
            });
            interfaces.setPresenceCallback((display: string) => {
                voice.setNeroDisplay(display);
            });
            voice.fetchPresence();
        }
    });

    onDestroy(() => {
        interfaces.setVoiceMigrateCallback(null);
        interfaces.setPresenceCallback(null);
        interfaces.disconnectGlobalEvents();
    });
</script>

<svelte:head>
    <title>Nero</title>
    <meta name="description" content="AI companion with terminal, voice, and SMS interfaces" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
</svelte:head>

{#if isBareRoute}
    {@render children()}
{:else}
    <div class="flex h-screen w-full bg-background font-body">
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

    {#if interfaces.openInterfaces.size > 0}
        <div class="fixed top-4 right-4 z-[999] flex flex-col gap-3 max-h-[calc(100vh-2rem)] overflow-y-auto">
            {#each [...interfaces.openInterfaces.values()] as schema (schema.id)}
                <DisplayPanel {schema} onClose={(id) => interfaces.closeInterface(id)} />
            {/each}
        </div>
    {/if}
{/if}

<Toaster />
