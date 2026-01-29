<script lang="ts">
    import type { CommandWidget } from '$lib/commands';
    import { cn } from '$lib/utils';

    type Props = {
        widget: CommandWidget;
    };

    let { widget }: Props = $props();

    function getColor(percentage: number): string {
        if (percentage > 80) return 'text-red-400';
        if (percentage > 60) return 'text-primary';
        return 'text-green-400';
    }

    function getBarColor(percentage: number): string {
        if (percentage > 80) return 'bg-red-400';
        if (percentage > 60) return 'bg-primary';
        return 'bg-green-400';
    }

    function getUsageColor(remaining: number): string {
        if (remaining < 1) return 'text-red-400';
        if (remaining < 5) return 'text-primary';
        return 'text-green-400';
    }
</script>

{#if widget.type === 'context'}
    {@const { tokens, limit, percentage } = widget.data}
    <div class="message-appear">
        <div class="glass-panel rounded-xl p-4 space-y-3 max-w-sm">
            <div class="flex items-center justify-between">
                <span class="text-sm text-muted-foreground">Context Usage</span>
                <span class={cn('text-sm font-mono font-medium', getColor(percentage))}>{percentage}%</span>
            </div>
            <div class="h-2 rounded-full bg-background/50 overflow-hidden border border-border/30">
                <div
                    class={cn('h-full rounded-full transition-all', getBarColor(percentage))}
                    style="width: {percentage}%"
                ></div>
            </div>
            <div class="flex justify-between text-xs text-muted-foreground">
                <span>{tokens.toLocaleString()} tokens</span>
                <span>{limit.toLocaleString()} limit</span>
            </div>
            {#if percentage > 70}
                <p class="text-xs text-amber-400 pt-1">Tip: Run /compact to reduce context usage</p>
            {/if}
        </div>
    </div>
{:else if widget.type === 'usage'}
    {@const { limit, usage, remaining } = widget.data}
    {@const hasLimit = limit !== null && limit > 0}
    <div class="message-appear">
        <div class="glass-panel rounded-xl p-4 space-y-3 max-w-md">
            <div class="text-sm text-muted-foreground">OpenRouter Credits</div>
            {#if hasLimit}
                {@const percentage = Math.round((usage / limit) * 100)}
                <div class="grid grid-cols-3 gap-2">
                    <div class="text-center p-2 rounded-lg bg-background/30 border border-border/20">
                        <div class="text-base font-mono text-foreground">${limit.toFixed(2)}</div>
                        <div class="text-[10px] text-muted-foreground uppercase tracking-wide">Limit</div>
                    </div>
                    <div class="text-center p-2 rounded-lg bg-background/30 border border-border/20">
                        <div class="text-base font-mono text-foreground">${usage.toFixed(2)}</div>
                        <div class="text-[10px] text-muted-foreground uppercase tracking-wide">Used</div>
                    </div>
                    <div class="text-center p-2 rounded-lg bg-background/30 border border-border/20">
                        <div class={cn('text-base font-mono', getUsageColor(remaining))}>${remaining.toFixed(2)}</div>
                        <div class="text-[10px] text-muted-foreground uppercase tracking-wide">Left</div>
                    </div>
                </div>
                <div class="h-1.5 rounded-full bg-background/50 overflow-hidden border border-border/30">
                    <div
                        class={cn('h-full rounded-full transition-all', getUsageColor(remaining).replace('text-', 'bg-'))}
                        style="width: {percentage}%"
                    ></div>
                </div>
                {#if remaining < 1}
                    <p class="text-xs text-red-400">
                        Low balance! <a href="https://openrouter.ai/credits" target="_blank" class="underline hover:text-red-300">Top up credits</a>
                    </p>
                {/if}
            {:else}
                <div class="text-center p-3 rounded-lg bg-background/30 border border-border/20">
                    <div class="text-xl font-mono text-foreground">${usage.toFixed(2)}</div>
                    <div class="text-xs text-muted-foreground mt-1">Total used (no limit set)</div>
                </div>
            {/if}
        </div>
    </div>
{:else if widget.type === 'think'}
    {@const { activities, thought, urgent } = widget.data}
    <div class="message-appear">
        <div class={cn(
            'glass-panel rounded-xl p-4 space-y-3 max-w-lg',
            urgent ? 'border-amber-400/30 bg-amber-400/[0.02]' : ''
        )}>
            <div class="flex items-center gap-2">
                <div class={cn(
                    'w-2 h-2 rounded-full',
                    urgent ? 'bg-amber-400 animate-pulse' : 'bg-green-400'
                )}></div>
                <span class="text-sm text-muted-foreground">Thought Complete</span>
                {#if urgent}
                    <span class="text-[10px] uppercase tracking-wider text-amber-400 font-medium px-1.5 py-0.5 rounded bg-amber-400/10 border border-amber-400/20">Urgent</span>
                {/if}
                {#if activities.length > 0}
                    <span class="text-[10px] text-muted-foreground/60 ml-auto">{activities.length} tool{activities.length === 1 ? '' : 's'} used</span>
                {/if}
            </div>

            {#if thought}
                <p class={cn('text-sm leading-relaxed', urgent ? 'text-foreground' : 'text-foreground/90')}>
                    {thought}
                </p>
            {:else}
                <p class="text-sm text-muted-foreground italic">Nothing notable to report.</p>
            {/if}
        </div>
    </div>
{/if}
