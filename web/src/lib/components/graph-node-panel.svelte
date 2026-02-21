<script lang="ts">
    import type { GraphNode } from '$lib/actions/graph';
    import { Button } from '$lib/components/ui/button';
    import Trash2 from '@lucide/svelte/icons/trash-2';
    import X from '@lucide/svelte/icons/x';
    import Link from '@lucide/svelte/icons/link';
    import Calendar from '@lucide/svelte/icons/calendar';
    import Eye from '@lucide/svelte/icons/eye';
    import Zap from '@lucide/svelte/icons/zap';
    import Loader2 from '@lucide/svelte/icons/loader-2';

    interface Connection {
        node: GraphNode;
        relation: string;
    }

    interface Props {
        node: GraphNode | null;
        connections: Connection[];
        onClose: () => void;
        onNavigate: (id: number) => void;
        onDelete: (id: number) => void;
    }

    let { node, connections, onClose, onNavigate, onDelete }: Props = $props();

    let deleting = $state(false);

    const TYPE_COLORS: Record<string, string> = {
        memory: '#4d94ff',
        person: '#33ccff',
        project: '#7b66ff',
        concept: '#4dffa6',
        event: '#ffaa33',
        preference: '#ff6699',
        tool: '#99ff33',
    };

    function getTypeColor(type: string): string {
        return TYPE_COLORS[type] || '#4d94ff';
    }

    function formatDate(dateStr: string | null): string {
        if (!dateStr) return 'Never';
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }

    async function handleDelete() {
        if (!node) return;
        deleting = true;
        onDelete(node.id);
    }

    $effect(() => {
        if (!node) deleting = false;
    });
</script>

<div
    class="absolute right-0 top-0 h-full w-[320px] max-w-[85vw] border-l border-border/50 transition-transform duration-300 ease-out z-10"
    class:translate-x-0={node !== null}
    class:translate-x-full={node === null}
    style="pointer-events: {node ? 'auto' : 'none'};"
>
    <div class="glass-panel h-full overflow-y-auto rounded-none border-0 border-l border-border/50">
        {#if node}
            <div class="p-5">
                <div class="flex items-start justify-between gap-3 mb-4">
                    <div
                        class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                        style="background: {getTypeColor(node.type)}18; color: {getTypeColor(node.type)};"
                    >
                        {node.type}
                    </div>
                    <button
                        type="button"
                        class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        onclick={onClose}
                    >
                        <X class="h-4 w-4" />
                    </button>
                </div>

                <h2 class="text-lg font-semibold tracking-tight font-display mb-3">
                    {node.label}
                </h2>

                {#if node.body}
                    <p class="text-sm text-muted-foreground leading-relaxed mb-5 whitespace-pre-wrap">
                        {node.body}
                    </p>
                {/if}

                {#if connections.length > 0}
                    <div class="mb-5">
                        <div class="flex items-center gap-2 mb-2.5">
                            <Link class="h-3.5 w-3.5 text-muted-foreground" />
                            <span class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Connections
                            </span>
                        </div>
                        <div class="space-y-1">
                            {#each connections as conn}
                                <button
                                    type="button"
                                    class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/50"
                                    onclick={() => onNavigate(conn.node.id)}
                                >
                                    <div
                                        class="h-2.5 w-2.5 rounded-full shrink-0"
                                        style="background: {getTypeColor(conn.node.type)};"
                                    ></div>
                                    <div class="min-w-0 flex-1">
                                        <div class="text-sm text-foreground truncate">{conn.node.label}</div>
                                        <div class="text-xs text-muted-foreground">{conn.relation}</div>
                                    </div>
                                </button>
                            {/each}
                        </div>
                    </div>
                {/if}

                <div class="space-y-3 mb-5">
                    <div class="flex items-center gap-2 mb-2.5">
                        <Zap class="h-3.5 w-3.5 text-muted-foreground" />
                        <span class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Metadata
                        </span>
                    </div>

                    <div>
                        <div class="flex items-center justify-between text-xs mb-1">
                            <span class="text-muted-foreground">Strength</span>
                            <span class="text-foreground tabular-nums">{node.strength.toFixed(2)}</span>
                        </div>
                        <div class="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                                class="h-full rounded-full transition-all duration-300"
                                style="width: {Math.min(100, (node.strength / 2) * 100)}%; background: {getTypeColor(node.type)};"
                            ></div>
                        </div>
                    </div>

                    <div class="flex items-center justify-between text-xs">
                        <span class="text-muted-foreground flex items-center gap-1.5">
                            <Eye class="h-3 w-3" />
                            Accessed
                        </span>
                        <span class="text-foreground tabular-nums">{node.access_count} times</span>
                    </div>

                    <div class="flex items-center justify-between text-xs">
                        <span class="text-muted-foreground flex items-center gap-1.5">
                            <Calendar class="h-3 w-3" />
                            Last accessed
                        </span>
                        <span class="text-foreground">{formatDate(node.last_accessed)}</span>
                    </div>

                    <div class="flex items-center justify-between text-xs">
                        <span class="text-muted-foreground flex items-center gap-1.5">
                            <Calendar class="h-3 w-3" />
                            Created
                        </span>
                        <span class="text-foreground">{formatDate(node.created_at)}</span>
                    </div>
                </div>

                <div class="pt-3 border-t border-border/50">
                    <Button
                        variant="ghost"
                        class="w-full justify-center gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onclick={handleDelete}
                        disabled={deleting}
                    >
                        {#if deleting}
                            <Loader2 class="h-4 w-4 animate-spin" />
                        {:else}
                            <Trash2 class="h-4 w-4" />
                        {/if}
                        Delete Node
                    </Button>
                </div>
            </div>
        {/if}
    </div>
</div>
