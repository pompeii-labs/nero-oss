<script lang="ts">
    import { cn } from '$lib/utils';
    import type { ToolActivity } from '$lib/actions/chat';
    import ChevronDown from '@lucide/svelte/icons/chevron-down';
    import ChevronRight from '@lucide/svelte/icons/chevron-right';
    import Loader2 from '@lucide/svelte/icons/loader-2';
    import Check from '@lucide/svelte/icons/check';
    import X from '@lucide/svelte/icons/x';
    import AlertCircle from '@lucide/svelte/icons/alert-circle';
    import Clock from '@lucide/svelte/icons/clock';
    import Zap from '@lucide/svelte/icons/zap';
    import ShieldOff from '@lucide/svelte/icons/shield-off';
    import DiffViewer from './diff-viewer.svelte';

    type Props = {
        activity: ToolActivity;
    };

    let { activity }: Props = $props();
    let expanded = $state(false);

    const statusConfig = {
        pending: { icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'from-amber-500/20 to-amber-500/5', border: 'border-amber-500/40 dark:border-amber-500/30' },
        approved: { icon: Check, color: 'text-green-600 dark:text-green-400', bg: 'from-green-500/20 to-green-500/5', border: 'border-green-500/40 dark:border-green-500/30' },
        denied: { icon: X, color: 'text-red-600 dark:text-red-400', bg: 'from-red-500/20 to-red-500/5', border: 'border-red-500/40 dark:border-red-500/30' },
        skipped: { icon: ShieldOff, color: 'text-orange-600 dark:text-orange-400', bg: 'from-orange-500/20 to-orange-500/5', border: 'border-orange-500/40 dark:border-orange-500/30' },
        running: { icon: Loader2, color: 'text-primary', bg: 'from-primary/20 to-primary/5', border: 'border-primary/30' },
        complete: { icon: Check, color: 'text-green-600 dark:text-green-400', bg: 'from-green-500/20 to-green-500/5', border: 'border-green-500/40 dark:border-green-500/30' },
        error: { icon: AlertCircle, color: 'text-red-600 dark:text-red-400', bg: 'from-red-500/20 to-red-500/5', border: 'border-red-500/40 dark:border-red-500/30' }
    };

    const config = $derived(statusConfig[activity.status]);
    const StatusIcon = $derived(config.icon);
</script>

<div class="message-appear glass-panel rounded-xl overflow-hidden">
    <button
        type="button"
        class="flex w-full items-center gap-3 px-4 py-3 text-left transition-all hover:bg-primary/5"
        onclick={() => (expanded = !expanded)}
    >
        <div class={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br border',
            config.bg,
            config.border
        )}>
            <Zap class={cn('h-4 w-4', config.color)} />
        </div>

        <div class="flex-1 min-w-0">
            <span class="font-mono text-sm text-foreground/90">{activity.displayName || activity.tool}</span>
            <div class="flex items-center gap-2 mt-0.5">
                <span class={cn('text-xs capitalize', config.color)}>{activity.status}</span>
            </div>
        </div>

        <div class="flex items-center gap-2">
            <StatusIcon
                class={cn(
                    'h-4 w-4',
                    config.color,
                    activity.status === 'running' && 'animate-spin'
                )}
            />
            {#if expanded}
                <ChevronDown class="h-4 w-4 text-muted-foreground" />
            {:else}
                <ChevronRight class="h-4 w-4 text-muted-foreground" />
            {/if}
        </div>
    </button>

    {#if expanded}
        <div class="border-t border-border/30 px-4 py-3 space-y-3">
            {#if (activity.tool === 'write' || activity.tool === 'update') && activity.args?.path && activity.args?.newContent}
                <DiffViewer
                    path={String(activity.args.path)}
                    oldContent={activity.args.oldContent as string | null}
                    newContent={String(activity.args.newContent)}
                    isNewFile={activity.args.isNewFile as boolean | undefined}
                />
            {:else}
            <div>
                <span class="text-xs text-muted-foreground uppercase tracking-wide">Arguments</span>
                <pre class="mt-2 overflow-x-auto rounded-lg bg-background/50 border border-border/30 p-3 font-mono text-xs text-foreground/80 whitespace-pre-wrap break-all">{JSON.stringify(activity.args, null, 2)}</pre>
            </div>
            {/if}

            {#if activity.result}
                <div>
                    <span class="text-xs text-green-600 dark:text-green-400 uppercase tracking-wide">Result</span>
                    <pre class="mt-2 overflow-x-auto rounded-lg bg-green-500/5 border border-green-500/30 dark:border-green-500/20 p-3 font-mono text-xs text-foreground/80 whitespace-pre-wrap break-all">{activity.result}</pre>
                </div>
            {/if}

            {#if activity.error}
                <div>
                    <span class="text-xs text-red-600 dark:text-red-400 uppercase tracking-wide">Error</span>
                    <pre class="mt-2 overflow-x-auto rounded-lg bg-red-500/10 border border-red-500/30 dark:border-red-500/20 p-3 font-mono text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap break-all">{activity.error}</pre>
                </div>
            {/if}

            {#if activity.skipReason}
                <div>
                    <span class="text-xs text-orange-600 dark:text-orange-400 uppercase tracking-wide">Skipped</span>
                    <pre class="mt-2 overflow-x-auto rounded-lg bg-orange-500/10 border border-orange-500/30 dark:border-orange-500/20 p-3 font-mono text-xs text-orange-600 dark:text-orange-400 whitespace-pre-wrap break-all">{activity.skipReason}</pre>
                </div>
            {/if}
        </div>
    {/if}
</div>
