<script lang="ts">
    import { cn } from '$lib/utils';
    import FilePlus from '@lucide/svelte/icons/file-plus';
    import FileEdit from '@lucide/svelte/icons/file-edit';

    type Props = {
        path: string;
        oldContent: string | null;
        newContent: string;
        isNewFile?: boolean;
        maxLines?: number;
    };

    let { path, oldContent, newContent, isNewFile = false, maxLines = 50 }: Props = $props();

    type DiffLine = {
        type: 'context' | 'added' | 'removed';
        content: string;
        oldLineNum?: number;
        newLineNum?: number;
    };

    function computeDiff(oldText: string | null, newText: string): DiffLine[] {
        if (oldText === null || isNewFile) {
            const lines = newText.split('\n');
            return lines.map((content, i) => ({
                type: 'added' as const,
                content,
                newLineNum: i + 1,
            }));
        }

        const oldLines = oldText.split('\n');
        const newLines = newText.split('\n');
        const result: DiffLine[] = [];

        let oldIdx = 0;
        let newIdx = 0;

        while (oldIdx < oldLines.length || newIdx < newLines.length) {
            if (oldIdx >= oldLines.length) {
                result.push({
                    type: 'added',
                    content: newLines[newIdx],
                    newLineNum: newIdx + 1,
                });
                newIdx++;
            } else if (newIdx >= newLines.length) {
                result.push({
                    type: 'removed',
                    content: oldLines[oldIdx],
                    oldLineNum: oldIdx + 1,
                });
                oldIdx++;
            } else if (oldLines[oldIdx] === newLines[newIdx]) {
                result.push({
                    type: 'context',
                    content: oldLines[oldIdx],
                    oldLineNum: oldIdx + 1,
                    newLineNum: newIdx + 1,
                });
                oldIdx++;
                newIdx++;
            } else {
                let foundMatch = false;
                for (let lookAhead = 1; lookAhead <= 3; lookAhead++) {
                    if (oldIdx + lookAhead < oldLines.length && oldLines[oldIdx + lookAhead] === newLines[newIdx]) {
                        for (let i = 0; i < lookAhead; i++) {
                            result.push({
                                type: 'removed',
                                content: oldLines[oldIdx + i],
                                oldLineNum: oldIdx + i + 1,
                            });
                        }
                        oldIdx += lookAhead;
                        foundMatch = true;
                        break;
                    }
                    if (newIdx + lookAhead < newLines.length && newLines[newIdx + lookAhead] === oldLines[oldIdx]) {
                        for (let i = 0; i < lookAhead; i++) {
                            result.push({
                                type: 'added',
                                content: newLines[newIdx + i],
                                newLineNum: newIdx + i + 1,
                            });
                        }
                        newIdx += lookAhead;
                        foundMatch = true;
                        break;
                    }
                }
                if (!foundMatch) {
                    result.push({
                        type: 'removed',
                        content: oldLines[oldIdx],
                        oldLineNum: oldIdx + 1,
                    });
                    result.push({
                        type: 'added',
                        content: newLines[newIdx],
                        newLineNum: newIdx + 1,
                    });
                    oldIdx++;
                    newIdx++;
                }
            }
        }

        return result;
    }

    function filterToChanges(diff: DiffLine[], contextLines: number = 3): DiffLine[] {
        const changeIndices = new Set<number>();

        diff.forEach((line, i) => {
            if (line.type !== 'context') {
                for (let j = Math.max(0, i - contextLines); j <= Math.min(diff.length - 1, i + contextLines); j++) {
                    changeIndices.add(j);
                }
            }
        });

        if (changeIndices.size === 0) return diff.slice(0, maxLines);

        const filtered: DiffLine[] = [];
        let lastIndex = -1;

        const sortedIndices = Array.from(changeIndices).sort((a, b) => a - b);

        for (const i of sortedIndices) {
            if (lastIndex !== -1 && i > lastIndex + 1) {
                filtered.push({ type: 'context', content: '...' });
            }
            filtered.push(diff[i]);
            lastIndex = i;

            if (filtered.length >= maxLines) break;
        }

        return filtered;
    }

    const diff = $derived(computeDiff(oldContent, newContent));
    const displayDiff = $derived(filterToChanges(diff));
    const stats = $derived({
        added: diff.filter(l => l.type === 'added').length,
        removed: diff.filter(l => l.type === 'removed').length,
    });
</script>

<div class="rounded-xl bg-background border border-border overflow-hidden max-w-full">
    <div class="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/50">
        {#if isNewFile}
            <FilePlus class="h-4 w-4 text-green-500" />
        {:else}
            <FileEdit class="h-4 w-4 text-primary" />
        {/if}
        <span class="font-mono text-xs text-foreground/80 truncate flex-1">{path}</span>
        <div class="flex items-center gap-2 text-xs">
            {#if stats.added > 0}
                <span class="text-green-600 dark:text-green-400">+{stats.added}</span>
            {/if}
            {#if stats.removed > 0}
                <span class="text-red-600 dark:text-red-400">-{stats.removed}</span>
            {/if}
        </div>
    </div>

    <div class="overflow-auto max-h-80">
        <table class="text-xs font-mono min-w-full">
            <tbody>
                {#each displayDiff as line}
                    <tr class={cn(
                        line.type === 'added' && 'bg-green-500/10',
                        line.type === 'removed' && 'bg-red-500/10',
                        line.content === '...' && 'bg-muted/30'
                    )}>
                        <td class="px-2 py-0.5 text-right text-muted-foreground/50 select-none w-10 border-r border-border/20">
                            {#if line.content === '...'}

                            {:else if line.type === 'removed'}
                                {line.oldLineNum}
                            {:else if line.type === 'added'}

                            {:else}
                                {line.oldLineNum}
                            {/if}
                        </td>
                        <td class="px-2 py-0.5 text-right text-muted-foreground/50 select-none w-10 border-r border-border/20">
                            {#if line.content === '...'}

                            {:else if line.type === 'removed'}

                            {:else if line.type === 'added'}
                                {line.newLineNum}
                            {:else}
                                {line.newLineNum}
                            {/if}
                        </td>
                        <td class={cn(
                            'px-2 py-0.5 w-4 select-none',
                            line.type === 'added' && 'text-green-600 dark:text-green-400',
                            line.type === 'removed' && 'text-red-600 dark:text-red-400'
                        )}>
                            {#if line.content === '...'}

                            {:else if line.type === 'added'}
                                +
                            {:else if line.type === 'removed'}
                                -
                            {:else}

                            {/if}
                        </td>
                        <td class={cn(
                            'px-2 py-0.5 whitespace-pre',
                            line.type === 'added' && 'text-green-800 dark:text-green-200',
                            line.type === 'removed' && 'text-red-800 dark:text-red-200',
                            line.content === '...' && 'text-muted-foreground text-center'
                        )}>
                            {line.content || ' '}
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
</div>
