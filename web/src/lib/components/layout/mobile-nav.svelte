<script lang="ts">
    import { page } from '$app/stores';
    import { cn } from '$lib/utils';
    import NeroIcon from '$lib/components/icons/nero-icon.svelte';
    import MessageSquare from '@lucide/svelte/icons/message-square';
    import Mic from '@lucide/svelte/icons/mic';
    import Brain from '@lucide/svelte/icons/brain';
    import Settings from '@lucide/svelte/icons/settings';
    import Puzzle from '@lucide/svelte/icons/puzzle';
    import Menu from '@lucide/svelte/icons/menu';
    import { Button } from '$lib/components/ui/button';
    import * as Sheet from '$lib/components/ui/sheet';

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
        { href: '/settings', label: 'Settings', icon: Settings }
    ];

    function isActive(href: string, pathname: string): boolean {
        if (href === '/') return pathname === '/';
        return pathname.startsWith(href);
    }

    let open = $state(false);
</script>

<header class="flex h-14 items-center justify-between border-b border-border bg-card px-4 md:hidden">
    <div class="flex items-center gap-3">
        <NeroIcon class="h-6 w-5 text-primary" />
        <span class="font-semibold text-foreground">Nero</span>
    </div>

    <Sheet.Root bind:open>
        <Sheet.Trigger>
            {#snippet child({ props })}
                <Button {...props} variant="ghost" size="icon">
                    <Menu class="h-5 w-5" />
                </Button>
            {/snippet}
        </Sheet.Trigger>
        <Sheet.Content side="left" class="w-64 p-0">
            <div class="flex items-center gap-3 border-b border-border px-4 py-4">
                <NeroIcon class="h-8 w-6 text-primary" />
                <span class="text-lg font-semibold text-foreground">Nero</span>
            </div>

            <nav class="flex-1 space-y-1 p-3">
                {#each navItems as item}
                    {@const active = isActive(item.href, $page.url.pathname)}
                    <a
                        href={item.href}
                        onclick={() => (open = false)}
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
        </Sheet.Content>
    </Sheet.Root>
</header>
