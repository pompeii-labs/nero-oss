<script lang="ts">
    import { page } from '$app/stores';
    import { onMount } from 'svelte';
    import { cn } from '$lib/utils';
    import NeroIcon from '$lib/components/icons/nero-icon.svelte';
    import MessageSquare from '@lucide/svelte/icons/message-square';
    import Mic from '@lucide/svelte/icons/mic';
    import Brain from '@lucide/svelte/icons/brain';
    import Settings from '@lucide/svelte/icons/settings';
    import Puzzle from '@lucide/svelte/icons/puzzle';
    import Database from '@lucide/svelte/icons/database';
    import Sun from '@lucide/svelte/icons/sun';
    import Moon from '@lucide/svelte/icons/moon';
    import RefreshCw from '@lucide/svelte/icons/refresh-cw';
    import { connectionStatus, startConnectionMonitor, checkConnection } from '$lib/stores/connection';
    import { theme, toggleTheme, initTheme } from '$lib/stores/theme';

    type NavItem = {
        href: string;
        label: string;
        icon: typeof MessageSquare;
    };

    const navItems: NavItem[] = [
        { href: '/', label: 'Chat', icon: MessageSquare },
        { href: '/voice', label: 'Voice', icon: Mic },
        { href: '/memories', label: 'Memories', icon: Brain },
        { href: '/mcp', label: 'MCP', icon: Puzzle },
        { href: '/database', label: 'Database', icon: Database },
        { href: '/settings', label: 'Settings', icon: Settings }
    ];

    function isActive(href: string, pathname: string): boolean {
        if (href === '/') return pathname === '/';
        return pathname.startsWith(href);
    }

    async function reconnect() {
        connectionStatus.set('connecting');
        const ok = await checkConnection();
        connectionStatus.set(ok ? 'connected' : 'disconnected');
    }

    onMount(() => {
        initTheme();
        startConnectionMonitor();
    });
</script>

<aside class="flex h-full w-64 flex-col border-r border-border bg-card">
    <div class="flex items-center gap-3 border-b border-border px-4 py-4">
        <NeroIcon class="h-8 w-6 text-primary" />
        <span class="text-lg font-semibold text-foreground">Nero</span>
    </div>

    <nav class="flex-1 space-y-1 p-3">
        {#each navItems as item}
            {@const active = isActive(item.href, $page.url.pathname)}
            <a
                href={item.href}
                class={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
            >
                <item.icon class="h-4 w-4" />
                {item.label}
            </a>
        {/each}
    </nav>

    <div class="border-t border-border p-3 space-y-2">
        <button
            type="button"
            onclick={toggleTheme}
            class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
            {#if $theme === 'dark'}
                <Sun class="h-4 w-4" />
                <span>Light Mode</span>
            {:else}
                <Moon class="h-4 w-4" />
                <span>Dark Mode</span>
            {/if}
        </button>

        <div class="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
            <div class="flex items-center gap-2">
                {#if $connectionStatus === 'connected'}
                    <div class="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
                    <span class="text-xs text-muted-foreground">Connected</span>
                {:else if $connectionStatus === 'connecting'}
                    <RefreshCw class="h-3 w-3 text-amber-600 dark:text-amber-400 animate-spin" />
                    <span class="text-xs text-amber-600 dark:text-amber-400">Connecting...</span>
                {:else}
                    <div class="h-2 w-2 rounded-full bg-red-500"></div>
                    <span class="text-xs text-red-600 dark:text-red-400">Disconnected</span>
                {/if}
            </div>
            {#if $connectionStatus === 'disconnected'}
                <button
                    type="button"
                    onclick={reconnect}
                    class="text-xs text-primary hover:text-primary/80 transition-colors"
                >
                    Retry
                </button>
            {/if}
        </div>
    </div>
</aside>
