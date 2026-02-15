<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { getLogs, createLogStream, type LogEntry } from '$lib/actions/logs';
    import ScrollText from '@lucide/svelte/icons/scroll-text';
    import Loader2 from '@lucide/svelte/icons/loader-2';
    import Pause from '@lucide/svelte/icons/pause';
    import Play from '@lucide/svelte/icons/play';
    import Trash2 from '@lucide/svelte/icons/trash-2';
    import ArrowDown from '@lucide/svelte/icons/arrow-down';
    import { Button } from '$lib/components/ui/button';

    let entries: LogEntry[] = $state([]);
    let loading = $state(true);
    let streaming = $state(true);
    let autoScroll = $state(true);
    let levelFilter: string = $state('');
    let scrollContainer: HTMLDivElement | undefined = $state();
    let stream: { close: () => void } | null = null;

    const MAX_ENTRIES = 2000;

    const filteredEntries = $derived(
        levelFilter ? entries.filter((e) => e.level === levelFilter) : entries,
    );

    function levelColor(level: string): string {
        switch (level) {
            case 'DEBUG':
                return 'text-muted-foreground';
            case 'INFO':
                return 'text-blue-500 dark:text-blue-400';
            case 'WARN':
                return 'text-amber-500 dark:text-amber-400';
            case 'ERROR':
                return 'text-red-500 dark:text-red-400';
            case 'TOOL':
                return 'text-purple-500 dark:text-purple-400';
            default:
                return 'text-muted-foreground';
        }
    }

    function levelBg(level: string): string {
        switch (level) {
            case 'DEBUG':
                return 'bg-muted/50';
            case 'INFO':
                return 'bg-blue-500/5';
            case 'WARN':
                return 'bg-amber-500/5';
            case 'ERROR':
                return 'bg-red-500/5';
            case 'TOOL':
                return 'bg-purple-500/5';
            default:
                return '';
        }
    }

    function formatTime(timestamp: string): string {
        return new Date(timestamp).toLocaleTimeString();
    }

    function scrollToBottom() {
        if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
    }

    function handleScroll() {
        if (!scrollContainer) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
        autoScroll = scrollHeight - scrollTop - clientHeight < 60;
    }

    function startStream() {
        stream?.close();
        stream = createLogStream((entry) => {
            entries = [...entries, entry];
            if (entries.length > MAX_ENTRIES) {
                entries = entries.slice(-MAX_ENTRIES);
            }
            if (autoScroll) {
                requestAnimationFrame(scrollToBottom);
            }
        });
        streaming = true;
    }

    function stopStream() {
        stream?.close();
        stream = null;
        streaming = false;
    }

    function clearLogs() {
        entries = [];
    }

    function setFilter(level: string) {
        levelFilter = level;
    }

    onMount(async () => {
        const response = await getLogs(500);
        if (response.success) {
            entries = response.data.entries;
        }
        loading = false;
        requestAnimationFrame(scrollToBottom);
        startStream();
    });

    onDestroy(() => {
        stream?.close();
    });

    const levels = ['', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'TOOL'];
</script>

<div class="flex h-full flex-col">
    <div class="border-b border-border/50 bg-card/30 backdrop-blur-sm p-6">
        <div class="mx-auto max-w-6xl">
            <div class="flex items-center justify-between">
                <div>
                    <h1 class="text-2xl font-semibold tracking-tight font-display">
                        <span class="text-gradient-nero">Logs</span>
                    </h1>
                    <p class="text-sm text-muted-foreground mt-1">
                        Service log output
                        {#if streaming}
                            <span class="inline-flex items-center gap-1 ml-2">
                                <span class="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                <span class="text-green-600 dark:text-green-400">Live</span>
                            </span>
                        {/if}
                    </p>
                </div>
                <div class="flex items-center gap-2">
                    <div class="flex items-center gap-1 rounded-lg border border-border/50 bg-muted/30 p-1">
                        {#each levels as level}
                            <button
                                type="button"
                                class="px-2 py-1 rounded text-xs font-medium transition-colors {levelFilter === level ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}"
                                onclick={() => setFilter(level)}
                            >
                                {level || 'All'}
                            </button>
                        {/each}
                    </div>
                    <Button variant="ghost" size="icon" class="h-8 w-8" onclick={clearLogs} title="Clear">
                        <Trash2 class="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" class="h-8 w-8" onclick={() => streaming ? stopStream() : startStream()} title={streaming ? 'Pause' : 'Resume'}>
                        {#if streaming}
                            <Pause class="h-4 w-4" />
                        {:else}
                            <Play class="h-4 w-4" />
                        {/if}
                    </Button>
                </div>
            </div>
        </div>
    </div>

    <div class="flex-1 overflow-hidden relative">
        {#if loading}
            <div class="flex flex-col items-center justify-center py-20">
                <div class="relative">
                    <div class="absolute inset-0 blur-2xl bg-primary/20 rounded-full"></div>
                    <Loader2 class="relative h-8 w-8 animate-spin text-primary" />
                </div>
                <p class="mt-4 text-sm text-muted-foreground">Loading logs...</p>
            </div>
        {:else if entries.length === 0}
            <div class="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <ScrollText class="h-12 w-12 mb-4 opacity-30" />
                <p class="text-sm">No logs yet</p>
            </div>
        {:else}
            <div
                bind:this={scrollContainer}
                onscroll={handleScroll}
                class="h-full overflow-y-auto font-mono text-xs"
            >
                <div class="min-w-0">
                    {#each filteredEntries as entry}
                        <div class="flex gap-3 px-6 py-0.5 hover:bg-muted/30 {levelBg(entry.level)}">
                            <span class="text-muted-foreground/60 shrink-0 w-20 text-right">{formatTime(entry.timestamp)}</span>
                            <span class="shrink-0 w-12 text-right font-semibold {levelColor(entry.level)}">{entry.level}</span>
                            <span class="text-muted-foreground shrink-0 w-20 truncate">{entry.source}</span>
                            <span class="text-foreground break-all">{entry.message}</span>
                        </div>
                    {/each}
                </div>
            </div>

            {#if !autoScroll}
                <div class="absolute bottom-4 right-6">
                    <Button
                        variant="secondary"
                        size="sm"
                        class="shadow-lg"
                        onclick={() => { autoScroll = true; scrollToBottom(); }}
                    >
                        <ArrowDown class="h-3 w-3 mr-1" />
                        Scroll to bottom
                    </Button>
                </div>
            {/if}
        {/if}
    </div>
</div>
