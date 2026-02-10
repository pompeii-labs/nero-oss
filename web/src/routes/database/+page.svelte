<script lang="ts">
    import { onMount } from 'svelte';
    import { getServerInfo, type ServerInfo } from '$lib/actions/health';
    import Database from '@lucide/svelte/icons/database';
    import Check from '@lucide/svelte/icons/check';
    import X from '@lucide/svelte/icons/x';
    import Terminal from '@lucide/svelte/icons/terminal';
    import Copy from '@lucide/svelte/icons/copy';
    import Loader2 from '@lucide/svelte/icons/loader-2';
    import { Button } from '$lib/components/ui/button';
    import { toast } from 'svelte-sonner';

    let serverInfo: ServerInfo | null = $state(null);
    let loading = $state(true);

    onMount(async () => {
        const response = await getServerInfo();
        if (response.success) {
            serverInfo = response.data;
        }
        loading = false;
    });

    async function copyToClipboard(text: string) {
        await navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard');
    }

    const isConnected = $derived(serverInfo?.features.database ?? false);
</script>

<div class="flex h-full flex-col">
    <div class="border-b border-border/50 bg-card/30 backdrop-blur-sm p-6">
        <div class="mx-auto max-w-4xl">
            <h1 class="text-2xl font-semibold tracking-tight font-display">
                <span class="text-gradient-nero">Database</span>
            </h1>
            <p class="text-sm text-muted-foreground mt-1">PostgreSQL connection status</p>
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
                    <p class="mt-4 text-sm text-muted-foreground">Checking database...</p>
                </div>
            {:else if isConnected}
                <div
                    class="rounded-xl border border-border/50 bg-gradient-to-br from-card/80 to-card/40 overflow-hidden opacity-0 animate-[floatUp_0.4s_ease-out_forwards]"
                >
                    <div class="p-4 border-b border-border/30">
                        <div class="flex items-center gap-3">
                            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-green-500/20 to-green-500/5 border border-green-500/30 dark:border-green-500/20">
                                <Database class="h-5 w-5 text-green-600 dark:text-green-400" />
                            </div>
                            <div>
                                <h2 class="font-medium text-foreground">PostgreSQL Connected</h2>
                                <p class="text-xs text-muted-foreground">Nero is persisting data to your database</p>
                            </div>
                            <div class="ml-auto">
                                <div class="flex items-center gap-2">
                                    <span class="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                                    <span class="text-sm text-green-600 dark:text-green-400">Connected</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="p-4">
                        <p class="text-sm text-muted-foreground">
                            Your conversation history, memories, and scheduled actions are being stored in PostgreSQL.
                        </p>
                    </div>
                </div>
            {:else}
                <div
                    class="rounded-xl border border-border/50 bg-gradient-to-br from-card/80 to-card/40 overflow-hidden opacity-0 animate-[floatUp_0.4s_ease-out_forwards]"
                >
                    <div class="p-4 border-b border-border/30">
                        <div class="flex items-center gap-3">
                            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/30 dark:border-amber-500/20">
                                <Database class="h-5 w-5 text-amber-600 dark:text-amber-400" />
                            </div>
                            <div>
                                <h2 class="font-medium text-foreground">Database Not Connected</h2>
                                <p class="text-xs text-muted-foreground">Nero is running without persistence</p>
                            </div>
                            <div class="ml-auto">
                                <div class="flex items-center gap-2">
                                    <X class="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                    <span class="text-sm text-amber-600 dark:text-amber-400">Not Connected</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="p-4 space-y-4">
                        <p class="text-sm text-muted-foreground">
                            Without a database connection, Nero will not persist conversation history, memories, or scheduled actions between sessions.
                        </p>

                        <div class="rounded-lg bg-muted/30 border border-border/30 p-4 space-y-3">
                            <h3 class="text-sm font-medium text-foreground">Setup Instructions</h3>

                            <div class="space-y-2">
                                <p class="text-sm text-muted-foreground">1. Set the <code class="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-xs">DATABASE_URL</code> environment variable:</p>
                                <div class="flex items-center gap-2">
                                    <code class="flex-1 px-3 py-2 rounded-md bg-background border border-border font-mono text-xs text-foreground overflow-x-auto">
                                        DATABASE_URL=postgresql://user:password@localhost:5432/nero
                                    </code>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        class="h-8 w-8 shrink-0"
                                        onclick={() => copyToClipboard('DATABASE_URL=postgresql://user:password@localhost:5432/nero')}
                                    >
                                        <Copy class="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div class="space-y-2">
                                <p class="text-sm text-muted-foreground">2. Restart the Nero service:</p>
                                <div class="flex items-center gap-2">
                                    <code class="flex-1 px-3 py-2 rounded-md bg-background border border-border font-mono text-xs text-foreground">
                                        nero service restart
                                    </code>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        class="h-8 w-8 shrink-0"
                                        onclick={() => copyToClipboard('nero service restart')}
                                    >
                                        <Copy class="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div class="rounded-lg bg-primary/5 border border-primary/20 p-3">
                            <p class="text-xs text-muted-foreground">
                                <span class="font-medium text-primary">Tip:</span> You can use any PostgreSQL-compatible database including Supabase, Neon, or a local PostgreSQL instance.
                            </p>
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div>
