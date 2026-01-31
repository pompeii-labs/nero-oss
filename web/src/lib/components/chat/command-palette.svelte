<script lang="ts">
    import { cn } from '$lib/utils';
    import type { Suggestion } from '$lib/commands';
    import Terminal from '@lucide/svelte/icons/terminal';

    type Props = {
        suggestions: Suggestion[];
        selectedIndex: number;
        onSelect: (suggestion: Suggestion) => void;
    };

    let { suggestions, selectedIndex, onSelect }: Props = $props();
</script>

{#if suggestions.length > 0}
    <div class="absolute bottom-full left-0 right-0 mb-2 rounded-lg border border-border bg-popover shadow-xl overflow-hidden">
        <div class="max-h-[280px] overflow-y-auto py-1">
            {#each suggestions as suggestion, i}
                {#if suggestion.type === 'command'}
                    {@const command = suggestion.command}
                    <button
                        type="button"
                        class={cn(
                            'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                            i === selectedIndex
                                ? 'bg-primary/10 text-primary'
                                : 'text-foreground hover:bg-accent'
                        )}
                        onclick={() => onSelect(suggestion)}
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
                {:else}
                    <button
                        type="button"
                        class={cn(
                            'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                            i === selectedIndex
                                ? 'bg-primary/10 text-primary'
                                : 'text-foreground hover:bg-accent'
                        )}
                        onclick={() => onSelect(suggestion)}
                    >
                        <Terminal class="h-4 w-4 {suggestion.loaded ? 'text-green-500' : 'text-muted-foreground'}" />
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2">
                                <span class="font-mono text-sm font-medium">/{suggestion.name}</span>
                                {#if suggestion.loaded}
                                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-500 font-medium">loaded</span>
                                {/if}
                            </div>
                            <p class="text-xs text-muted-foreground truncate">{suggestion.description}</p>
                        </div>
                    </button>
                {/if}
            {/each}
        </div>
    </div>
{/if}
