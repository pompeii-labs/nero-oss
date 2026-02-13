<script lang="ts">
    import { cn } from '$lib/utils';
    import type { ToolActivity } from '$lib/actions/chat';
    import ToolActivityComponent from './tool-activity.svelte';
    import ChevronDown from '@lucide/svelte/icons/chevron-down';
    import ChevronRight from '@lucide/svelte/icons/chevron-right';
    import Loader2 from '@lucide/svelte/icons/loader-2';
    import Check from '@lucide/svelte/icons/check';
    import AlertCircle from '@lucide/svelte/icons/alert-circle';
    import GitBranch from '@lucide/svelte/icons/git-branch';

    type Props = {
        activities: ToolActivity[];
    };

    let { activities }: Props = $props();
    let expanded = $state(false);

    type SubagentGroup = {
        id: string;
        parent: ToolActivity | null;
        children: ToolActivity[];
    };

    const grouped = $derived.by(() => {
        const groups = new Map<string, SubagentGroup>();

        for (const activity of activities) {
            const sid = activity.subagentId;
            if (!sid) continue;

            if (!groups.has(sid)) {
                groups.set(sid, { id: sid, parent: null, children: [] });
            }
            const group = groups.get(sid)!;

            if (activity.tool === 'subagent') {
                group.parent = activity;
            } else {
                group.children.push(activity);
            }
        }

        return Array.from(groups.values());
    });

    const isRunning = $derived(
        grouped.some((g) => g.parent?.status === 'running')
    );

    const completedCount = $derived(
        grouped.filter((g) => g.parent?.status === 'complete' || g.parent?.status === 'error').length
    );

    const totalCount = $derived(grouped.length);

    const statusText = $derived(
        isRunning
            ? `Running ${totalCount} subagents...`
            : `${completedCount} subagent${completedCount !== 1 ? 's' : ''} complete`
    );

    $effect(() => {
        if (isRunning) expanded = true;
    });
</script>

<div class="message-appear glass-panel rounded-xl overflow-hidden">
    <button
        type="button"
        class="flex w-full items-center gap-3 px-4 py-3 text-left transition-all hover:bg-primary/5"
        onclick={() => (expanded = !expanded)}
    >
        <div class={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br border',
            isRunning
                ? 'from-primary/20 to-primary/5 border-primary/30'
                : 'from-green-500/20 to-green-500/5 border-green-500/30'
        )}>
            <GitBranch class={cn('h-4 w-4', isRunning ? 'text-primary' : 'text-green-400')} />
        </div>

        <div class="flex-1 min-w-0">
            <span class="font-mono text-sm text-foreground/90">{statusText}</span>
            <div class="flex items-center gap-3 mt-0.5">
                {#each grouped as group}
                    <div class="flex items-center gap-1">
                        {#if group.parent?.status === 'running'}
                            <Loader2 class="h-3 w-3 text-primary animate-spin" />
                        {:else if group.parent?.status === 'complete'}
                            <Check class="h-3 w-3 text-green-400" />
                        {:else if group.parent?.status === 'error'}
                            <AlertCircle class="h-3 w-3 text-red-400" />
                        {/if}
                        <span class="text-xs text-muted-foreground">{group.id}</span>
                    </div>
                {/each}
            </div>
        </div>

        <div class="flex items-center gap-2">
            {#if isRunning}
                <Loader2 class="h-4 w-4 text-primary animate-spin" />
            {:else}
                <Check class="h-4 w-4 text-green-400" />
            {/if}
            {#if expanded}
                <ChevronDown class="h-4 w-4 text-muted-foreground" />
            {:else}
                <ChevronRight class="h-4 w-4 text-muted-foreground" />
            {/if}
        </div>
    </button>

    {#if expanded}
        <div class="border-t border-border/30 px-4 py-3 space-y-4">
            {#each grouped as group}
                <div class="space-y-2">
                    <div class="flex items-center gap-2">
                        {#if group.parent?.status === 'running'}
                            <Loader2 class="h-3.5 w-3.5 text-primary animate-spin" />
                        {:else if group.parent?.status === 'complete'}
                            <Check class="h-3.5 w-3.5 text-green-400" />
                        {:else if group.parent?.status === 'error'}
                            <AlertCircle class="h-3.5 w-3.5 text-red-400" />
                        {/if}
                        <span class="font-mono text-sm font-medium text-foreground/90">{group.id}</span>
                        <span class="text-xs text-muted-foreground/60">{group.parent?.args?.mode || 'research'}</span>
                        <span class="text-xs text-muted-foreground/40 ml-auto">{group.children.length} tool{group.children.length !== 1 ? 's' : ''}</span>
                    </div>

                    {#if group.children.length > 0}
                        {@const visible = group.children.slice(-5)}
                        {@const hidden = group.children.length - visible.length}
                        <div class="ml-5 border-l border-border/20 pl-3 space-y-1.5">
                            {#if hidden > 0}
                                <div class="text-xs text-muted-foreground/30 font-mono">+ {hidden} more</div>
                            {/if}
                            {#each visible as child}
                                <div class="flex items-center gap-2 text-xs">
                                    {#if child.status === 'running'}
                                        <Loader2 class="h-3 w-3 text-primary animate-spin shrink-0" />
                                    {:else if child.status === 'complete'}
                                        <Check class="h-3 w-3 text-green-400/60 shrink-0" />
                                    {:else if child.status === 'error'}
                                        <AlertCircle class="h-3 w-3 text-red-400/60 shrink-0" />
                                    {/if}
                                    <span class="text-muted-foreground/70 font-mono">{child.displayName || child.tool}</span>
                                    {#if child.result}
                                        <span class="text-muted-foreground/40 truncate">{child.result}</span>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    {/if}

                    {#if group.parent?.status === 'error' && group.parent?.error}
                        <div class="ml-5 text-xs text-red-400/80 font-mono">{group.parent.error}</div>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</div>
