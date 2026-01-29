<script lang="ts">
    import { cn } from '$lib/utils';
    import type { SlashCommand } from '$lib/commands';
    import Terminal from '@lucide/svelte/icons/terminal';

    type Props = {
        commands: SlashCommand[];
        selectedIndex: number;
        onSelect: (command: SlashCommand) => void;
    };

    let { commands, selectedIndex, onSelect }: Props = $props();
</script>

{#if commands.length > 0}
    <div class="absolute bottom-full left-0 right-0 mb-2 rounded-lg border border-border bg-popover shadow-xl overflow-hidden">
        <div class="px-3 py-2 border-b border-border">
            <span class="text-xs font-medium text-muted-foreground">Commands</span>
        </div>
        <div class="max-h-[200px] overflow-y-auto py-1">
            {#each commands as command, i}
                <button
                    type="button"
                    class={cn(
                        'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                        i === selectedIndex
                            ? 'bg-primary/10 text-primary'
                            : 'text-foreground hover:bg-accent'
                    )}
                    onclick={() => onSelect(command)}
                >
                    <Terminal class="h-4 w-4 text-muted-foreground" />
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                            <span class="font-mono text-sm font-medium">/{command.name}</span>
                            {#if command.aliases.length > 0}
                                <span class="text-xs text-muted-foreground">
                                    ({command.aliases.map(a => `/${a}`).join(', ')})
                                </span>
                            {/if}
                        </div>
                        <p class="text-xs text-muted-foreground truncate">{command.description}</p>
                    </div>
                </button>
            {/each}
        </div>
    </div>
{/if}
