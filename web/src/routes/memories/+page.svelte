<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { createMemory } from '$lib/actions/memories';
    import { deleteGraphNode, type GraphNode } from '$lib/actions/graph';
    import { graph } from '$lib/stores/graph.svelte';
    import GraphExplorer from '$lib/components/graph-explorer.svelte';
    import GraphNodePanel from '$lib/components/graph-node-panel.svelte';
    import * as Dialog from '$lib/components/ui/dialog';
    import { Button } from '$lib/components/ui/button';
    import { Textarea } from '$lib/components/ui/textarea';
    import { toast } from 'svelte-sonner';
    import Brain from '@lucide/svelte/icons/brain';
    import Plus from '@lucide/svelte/icons/plus';
    import Loader2 from '@lucide/svelte/icons/loader-2';
    import Search from '@lucide/svelte/icons/search';
    import X from '@lucide/svelte/icons/x';

    let selectedNodeId: number | null = $state(null);
    let focusNodeId: number | null = $state(null);
    let addDialogOpen = $state(false);
    let newMemoryContent = $state('');
    let saving = $state(false);
    let searchQuery = $state('');
    let searchOpen = $state(false);
    let searchIdx = $state(-1);
    let searchInputEl: HTMLInputElement;

    let selectedNode: GraphNode | null = $state(null);
    let connections: Array<{ node: GraphNode; relation: string }> = $state([]);

    $effect(() => {
        searchQuery;
        searchIdx = -1;
    });

    const searchResults = $derived.by(() => {
        if (!graph.graphData || !searchQuery.trim()) return [];
        const q = searchQuery.toLowerCase();
        return graph.graphData.nodes
            .filter(n => n.label.toLowerCase().includes(q) || (n.body && n.body.toLowerCase().includes(q)))
            .sort((a, b) => {
                const aLabel = a.label.toLowerCase();
                const bLabel = b.label.toLowerCase();
                const aStarts = aLabel.startsWith(q);
                const bStarts = bLabel.startsWith(q);
                if (aStarts && !bStarts) return -1;
                if (!aStarts && bStarts) return 1;
                return b.strength - a.strength;
            })
            .slice(0, 8);
    });

    onMount(() => {
        graph.startPolling();
    });

    onDestroy(() => {
        graph.stopPolling();
    });

    function handleSelectNode(id: number | null) {
        selectedNodeId = id;
    }

    function handleSearchSelect(node: GraphNode) {
        selectedNodeId = node.id;
        focusNodeId = node.id;
        setTimeout(() => { focusNodeId = null; }, 100);
        searchQuery = '';
        searchOpen = false;
    }

    function handleSearchKeydown(e: KeyboardEvent) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            searchIdx = Math.min(searchIdx + 1, searchResults.length - 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            searchIdx = Math.max(searchIdx - 1, -1);
        } else if (e.key === 'Enter' && searchResults.length > 0) {
            e.preventDefault();
            const idx = searchIdx >= 0 ? searchIdx : 0;
            handleSearchSelect(searchResults[idx]);
        } else if (e.key === 'Escape') {
            searchQuery = '';
            searchOpen = false;
        }
    }

    function openSearch() {
        searchOpen = true;
        requestAnimationFrame(() => searchInputEl?.focus());
    }

    $effect(() => {
        if (!graph.graphData || selectedNodeId === null) {
            selectedNode = null;
            connections = [];
            return;
        }

        const gd = graph.graphData;
        const node = gd.nodes.find(n => n.id === selectedNodeId);
        if (!node) {
            selectedNode = null;
            connections = [];
            return;
        }

        selectedNode = node;

        const conns: Array<{ node: GraphNode; relation: string }> = [];
        for (const edge of gd.edges) {
            let otherId: number | null = null;
            let relation = edge.relation;
            if (edge.source === selectedNodeId) otherId = edge.target;
            else if (edge.target === selectedNodeId) otherId = edge.source;

            if (otherId !== null) {
                const other = gd.nodes.find(n => n.id === otherId);
                if (other) {
                    conns.push({ node: other, relation });
                }
            }
        }
        connections = conns;
    });

    async function handleAddMemory() {
        if (!newMemoryContent.trim()) return;
        saving = true;

        const response = await createMemory(newMemoryContent.trim());
        if (response.success) {
            newMemoryContent = '';
            addDialogOpen = false;
            toast.success('Memory saved');
            await graph.refresh();
        } else {
            toast.error('Failed to save memory');
        }
        saving = false;
    }

    async function handleDeleteNode(id: number) {
        const response = await deleteGraphNode(id);
        if (response.success) {
            if (selectedNodeId === id) selectedNodeId = null;
            toast.success('Node deleted');
            await graph.refresh();
        } else {
            toast.error('Failed to delete node');
        }
    }

    const hasNodes = $derived(graph.graphData && graph.graphData.nodes.length > 0);
</script>

<svelte:window
    onkeydown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            openSearch();
        }
    }}
    onclick={(e) => {
        if (searchOpen && !(e.target as HTMLElement).closest('.search-container')) {
            searchOpen = false;
        }
    }}
/>

<div class="flex h-full flex-col">
    <div class="relative z-20 border-b border-border/50 bg-card/30 backdrop-blur-sm px-6 py-3">
        <div class="flex items-center justify-between gap-3">
            <h1 class="text-lg font-semibold tracking-tight font-display shrink-0">
                <span class="text-gradient-nero">Memories</span>
            </h1>
            {#if hasNodes}
                <div class="search-container relative flex-1 max-w-sm">
                    <div class="relative">
                        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        <input
                            bind:this={searchInputEl}
                            bind:value={searchQuery}
                            onfocus={() => { searchOpen = true; }}
                            onkeydown={handleSearchKeydown}
                            type="text"
                            placeholder="Search nodes..."
                            class="h-8 w-full rounded-lg border border-border/50 bg-muted/50 pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                        />
                        {#if searchQuery}
                            <button
                                type="button"
                                class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                onclick={() => { searchQuery = ''; }}
                            >
                                <X class="h-3.5 w-3.5" />
                            </button>
                        {:else}
                            <span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60 pointer-events-none">
                                {navigator.platform?.includes('Mac') ? '\u2318' : 'Ctrl+'}K
                            </span>
                        {/if}
                    </div>
                    {#if searchOpen && searchQuery.trim() && searchResults.length > 0}
                        <div class="absolute top-full left-0 right-0 mt-1 rounded-lg border border-border/50 bg-card/95 backdrop-blur-md shadow-lg overflow-hidden z-50">
                            {#each searchResults as result, i}
                                <button
                                    type="button"
                                    class="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/50 {i === searchIdx ? 'bg-muted/50' : ''}"
                                    onclick={() => handleSearchSelect(result)}
                                >
                                    <div class="h-2 w-2 rounded-full shrink-0 bg-primary/60"></div>
                                    <div class="min-w-0 flex-1">
                                        <div class="text-sm text-foreground truncate">{result.label}</div>
                                        <div class="text-xs text-muted-foreground truncate">{result.type}</div>
                                    </div>
                                </button>
                            {/each}
                        </div>
                    {/if}
                    {#if searchOpen && searchQuery.trim() && searchResults.length === 0}
                        <div class="absolute top-full left-0 right-0 mt-1 rounded-lg border border-border/50 bg-card/95 backdrop-blur-md shadow-lg overflow-hidden z-50">
                            <div class="px-3 py-3 text-xs text-muted-foreground text-center">No results</div>
                        </div>
                    {/if}
                </div>
            {/if}
            <Dialog.Root bind:open={addDialogOpen}>
                <Dialog.Trigger>
                    {#snippet child({ props })}
                        <Button {...props} size="sm" class="gap-2 shrink-0">
                            <Plus class="h-4 w-4" />
                            Add Memory
                        </Button>
                    {/snippet}
                </Dialog.Trigger>
                <Dialog.Content class="sm:max-w-md border-border/50 bg-card">
                    <Dialog.Header>
                        <Dialog.Title>Add Memory</Dialog.Title>
                        <Dialog.Description>
                            Add information you want Nero to remember.
                        </Dialog.Description>
                    </Dialog.Header>
                    <div class="py-4">
                        <Textarea
                            bind:value={newMemoryContent}
                            placeholder="Enter something to remember..."
                            class="min-h-[120px] bg-muted/50 border-border/50 focus:border-primary/50"
                        />
                    </div>
                    <Dialog.Footer>
                        <Button variant="outline" onclick={() => (addDialogOpen = false)}>
                            Cancel
                        </Button>
                        <Button onclick={handleAddMemory} disabled={saving || !newMemoryContent.trim()}>
                            {#if saving}
                                <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                            {/if}
                            Save
                        </Button>
                    </Dialog.Footer>
                </Dialog.Content>
            </Dialog.Root>
        </div>
    </div>

    <div class="relative flex-1 overflow-hidden">
        {#if !graph.graphData}
            <div class="flex flex-col items-center justify-center h-full">
                <div class="relative">
                    <div class="absolute inset-0 blur-2xl bg-primary/20 rounded-full"></div>
                    <Loader2 class="relative h-8 w-8 animate-spin text-primary" />
                </div>
                <p class="mt-4 text-sm text-muted-foreground">Loading graph...</p>
            </div>
        {:else if !hasNodes}
            <div class="flex flex-col items-center justify-center h-full text-center">
                <div class="relative mb-6">
                    <div class="absolute inset-0 blur-2xl bg-primary/10 rounded-full scale-150"></div>
                    <div class="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-muted to-muted/60 border border-border/50">
                        <Brain class="h-8 w-8 text-muted-foreground" />
                    </div>
                </div>
                <h2 class="text-lg font-medium text-foreground">No memories yet</h2>
                <p class="mt-1 mb-6 text-sm text-muted-foreground max-w-sm">
                    Nero will remember things as you chat, or you can add them manually.
                </p>
                <Button onclick={() => (addDialogOpen = true)} class="gap-2">
                    <Plus class="h-4 w-4" />
                    Add Memory
                </Button>
            </div>
        {:else}
            <GraphExplorer
                graphData={graph.graphData}
                {selectedNodeId}
                {focusNodeId}
                onSelectNode={handleSelectNode}
            />
            <GraphNodePanel
                node={selectedNode}
                {connections}
                onClose={() => { selectedNodeId = null; }}
                onNavigate={(id) => {
                    selectedNodeId = id;
                    focusNodeId = id;
                    setTimeout(() => { focusNodeId = null; }, 100);
                }}
                onDelete={handleDeleteNode}
            />
        {/if}
    </div>
</div>
