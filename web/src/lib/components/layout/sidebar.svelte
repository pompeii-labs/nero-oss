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
    import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';
    import PanelLeft from '@lucide/svelte/icons/panel-left';
    import { connection } from '$lib/stores/connection.svelte';
    import { theme } from '$lib/stores/theme.svelte';
    import { sidebar } from '$lib/stores/sidebar.svelte';

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
        await connection.retry();
    }

    onMount(() => {
        theme.init();
        connection.start();
    });
</script>

<aside class={cn(
    "flex h-full flex-col border-r border-border bg-card transition-all duration-200",
    sidebar.collapsed ? "w-16" : "w-64"
)}>
    <div class={cn(
        "flex items-center border-b border-border px-4 py-4",
        sidebar.collapsed ? "justify-center" : "gap-3"
    )}>
        <NeroIcon class="h-8 w-6 text-primary flex-shrink-0" />
        {#if !sidebar.collapsed}
            <span class="text-lg font-semibold text-foreground font-display">Nero</span>
        {/if}
    </div>

    <nav class="flex-1 space-y-1 p-3">
        {#each navItems as item}
            {@const active = isActive(item.href, $page.url.pathname)}
            <a
                href={item.href}
                title={sidebar.collapsed ? item.label : undefined}
                class={cn(
                    'flex items-center rounded-md text-sm font-medium transition-colors',
                    sidebar.collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2',
                    active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
            >
                <item.icon class="h-4 w-4 flex-shrink-0" />
                {#if !sidebar.collapsed}
                    {item.label}
                {/if}
            </a>
        {/each}
    </nav>

    <div class="border-t border-border p-3 space-y-2">
        <button
            type="button"
            onclick={sidebar.toggle}
            title={sidebar.collapsed ? "Expand sidebar" : "Collapse sidebar"}
            class={cn(
                "flex w-full items-center rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
                sidebar.collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2"
            )}
        >
            {#if sidebar.collapsed}
                <PanelLeft class="h-4 w-4" />
            {:else}
                <PanelLeftClose class="h-4 w-4" />
                <span>Collapse</span>
            {/if}
        </button>

        <button
            type="button"
            onclick={theme.toggle}
            title={sidebar.collapsed ? (theme.value === 'dark' ? 'Light Mode' : 'Dark Mode') : undefined}
            class={cn(
                "flex w-full items-center rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
                sidebar.collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2"
            )}
        >
            {#if theme.value === 'dark'}
                <Sun class="h-4 w-4 flex-shrink-0" />
                {#if !sidebar.collapsed}
                    <span>Light Mode</span>
                {/if}
            {:else}
                <Moon class="h-4 w-4 flex-shrink-0" />
                {#if !sidebar.collapsed}
                    <span>Dark Mode</span>
                {/if}
            {/if}
        </button>

        <div class={cn(
            "flex items-center rounded-md bg-muted/50",
            sidebar.collapsed ? "justify-center px-2 py-2" : "justify-between px-3 py-2"
        )}>
            <div class="flex items-center gap-2">
                {#if connection.value === 'connected'}
                    <div class="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
                    {#if !sidebar.collapsed}
                        <span class="text-xs text-muted-foreground">Connected</span>
                    {/if}
                {:else if connection.value === 'connecting'}
                    <RefreshCw class="h-3 w-3 text-amber-400 animate-spin" />
                    {#if !sidebar.collapsed}
                        <span class="text-xs text-amber-400">Connecting...</span>
                    {/if}
                {:else}
                    <div class="h-2 w-2 rounded-full bg-red-500"></div>
                    {#if !sidebar.collapsed}
                        <span class="text-xs text-red-400">Disconnected</span>
                    {/if}
                {/if}
            </div>
            {#if connection.value === 'disconnected' && !sidebar.collapsed}
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
