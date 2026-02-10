<script lang="ts">
    import { onMount } from 'svelte';
    import { getMemories, createMemory, deleteMemory, type Memory } from '$lib/actions/memories';
    import * as Dialog from '$lib/components/ui/dialog';
    import { Button } from '$lib/components/ui/button';
    import { Textarea } from '$lib/components/ui/textarea';
    import { toast } from 'svelte-sonner';
    import Brain from '@lucide/svelte/icons/brain';
    import Plus from '@lucide/svelte/icons/plus';
    import Trash2 from '@lucide/svelte/icons/trash-2';
    import Calendar from '@lucide/svelte/icons/calendar';
    import Loader2 from '@lucide/svelte/icons/loader-2';
    import Sparkles from '@lucide/svelte/icons/sparkles';

    let memories: Memory[] = $state([]);
    let loading = $state(true);
    let addDialogOpen = $state(false);
    let newMemoryContent = $state('');
    let saving = $state(false);
    let deletingId: number | null = $state(null);

    onMount(async () => {
        await loadMemories();
    });

    async function loadMemories() {
        loading = true;
        const response = await getMemories();
        if (response.success) {
            memories = response.data;
        } else {
            toast.error('Failed to load memories');
        }
        loading = false;
    }

    async function handleAddMemory() {
        if (!newMemoryContent.trim()) return;
        saving = true;

        const response = await createMemory(newMemoryContent.trim());
        if (response.success) {
            memories = [response.data, ...memories];
            newMemoryContent = '';
            addDialogOpen = false;
            toast.success('Memory saved');
        } else {
            toast.error('Failed to save memory');
        }
        saving = false;
    }

    async function handleDeleteMemory(id: number) {
        deletingId = id;
        const response = await deleteMemory(id);
        if (response.success) {
            memories = memories.filter(m => m.id !== id);
            toast.success('Memory deleted');
        } else {
            toast.error('Failed to delete memory');
        }
        deletingId = null;
    }

    function formatDate(dateStr: string): string {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }
</script>

<div class="flex h-full flex-col">
    <div class="border-b border-border/50 bg-card/30 backdrop-blur-sm p-6">
        <div class="mx-auto max-w-4xl">
            <div class="flex items-start justify-between gap-4">
                <div>
                    <h1 class="text-2xl font-semibold tracking-tight font-display">
                        <span class="text-gradient-nero">Memories</span>
                    </h1>
                    <p class="text-sm text-muted-foreground mt-1">Information Nero remembers about you</p>
                </div>
                <Dialog.Root bind:open={addDialogOpen}>
                    <Dialog.Trigger>
                        {#snippet child({ props })}
                            <Button {...props} class="gap-2">
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
    </div>

    <div class="flex-1 overflow-y-auto">
        <div class="mx-auto max-w-4xl p-6">
            {#if loading}
                <div class="flex flex-col items-center justify-center py-20">
                    <div class="relative">
                        <div class="absolute inset-0 blur-2xl bg-primary/20 rounded-full"></div>
                        <Loader2 class="relative h-8 w-8 animate-spin text-primary" />
                    </div>
                    <p class="mt-4 text-sm text-muted-foreground">Loading memories...</p>
                </div>
            {:else if memories.length === 0}
                <div class="flex flex-col items-center justify-center py-20 text-center">
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
                <div class="grid gap-4 sm:grid-cols-2">
                    {#each memories as memory, i (memory.id)}
                        <div
                            class="group relative rounded-xl border border-border/50 bg-gradient-to-br from-card/80 to-card/40 p-4 transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 opacity-0 animate-[floatUp_0.4s_ease-out_forwards]"
                            style="animation-delay: {Math.min(i * 50, 300)}ms"
                        >
                            <div class="flex items-start justify-between gap-3">
                                <div class="flex items-start gap-3 min-w-0 flex-1">
                                    <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                                        <Sparkles class="h-4 w-4 text-primary" />
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <p class="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                                            {memory.body}
                                        </p>
                                        <div class="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                                            <Calendar class="h-3 w-3" />
                                            {formatDate(memory.created_at)}
                                        </div>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    class="h-8 w-8 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all"
                                    onclick={() => handleDeleteMemory(memory.id)}
                                    disabled={deletingId === memory.id}
                                >
                                    {#if deletingId === memory.id}
                                        <Loader2 class="h-4 w-4 animate-spin" />
                                    {:else}
                                        <Trash2 class="h-4 w-4" />
                                    {/if}
                                </Button>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
</div>
