<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import {
        listIntegrations,
        connectIntegration,
        reconnectIntegration,
        disconnectIntegration,
        type Integration,
    } from '$lib/actions/mcp';
    import * as Sheet from '$lib/components/ui/sheet';
    import { Button } from '$lib/components/ui/button';
    import { toast } from 'svelte-sonner';
    import Plus from '@lucide/svelte/icons/plus';
    import Trash2 from '@lucide/svelte/icons/trash-2';
    import RefreshCw from '@lucide/svelte/icons/refresh-cw';
    import Lock from '@lucide/svelte/icons/lock';
    import Globe from '@lucide/svelte/icons/globe';
    import Terminal from '@lucide/svelte/icons/terminal';
    import Cpu from '@lucide/svelte/icons/cpu';
    import Loader2 from '@lucide/svelte/icons/loader-2';
    import ChevronDown from '@lucide/svelte/icons/chevron-down';
    import ChevronRight from '@lucide/svelte/icons/chevron-right';
    import Plug from '@lucide/svelte/icons/plug';
    import { cn } from '$lib/utils';

    const presets = [
        { label: 'Lux', name: 'lux', url: 'https://api.luxdb.dev/mcp' },
        { label: 'GitHub', name: 'github', url: 'https://api.githubcopilot.com/mcp/' },
    ];

    let conns = $state<Integration[]>([]);
    let loading = $state(true);
    let panelOpen = $state(false);
    let busy = $state(false);
    let expanded = $state<Set<string>>(new Set());
    let pending = $state<Set<string>>(new Set());

    let fName = $state('');
    let fUrl = $state('');
    let fKey = $state('');

    let poll: ReturnType<typeof setInterval> | null = null;

    async function load() {
        conns = await listIntegrations();
        loading = false;
    }

    onMount(() => {
        void load();
        poll = setInterval(load, 3000);
    });
    onDestroy(() => poll && clearInterval(poll));

    function openNew() {
        fName = '';
        fUrl = '';
        fKey = '';
        panelOpen = true;
    }
    function usePreset(p: (typeof presets)[number]) {
        fName = p.name;
        fUrl = p.url;
    }

    function toggleExpand(name: string) {
        const s = new Set(expanded);
        s.has(name) ? s.delete(name) : s.add(name);
        expanded = s;
    }

    function mark(name: string, on: boolean) {
        const s = new Set(pending);
        on ? s.add(name) : s.delete(name);
        pending = s;
    }

    /** Open the auth tab and poll until the server reports connected. */
    function awaitAuth(name: string, authUrl: string) {
        window.open(authUrl, '_blank', 'noopener');
        mark(name, true);
        let tries = 0;
        const id = setInterval(async () => {
            tries++;
            await load();
            if (conns.find((c) => c.name === name)?.connected) {
                clearInterval(id);
                mark(name, false);
                toast.success(`${name} connected`);
            } else if (tries > 120) {
                clearInterval(id);
                mark(name, false);
            }
        }, 2000);
    }

    async function save() {
        if (!fName.trim() || !fUrl.trim()) return;
        busy = true;
        try {
            const r = await connectIntegration(fName.trim(), fUrl.trim(), fKey.trim() || undefined);
            panelOpen = false;
            if (r.status === 'auth_required' && r.authUrl) awaitAuth(fName.trim(), r.authUrl);
            else if (r.status === 'connected') toast.success(r.message);
            else toast.error(r.message);
            await load();
        } finally {
            busy = false;
        }
    }

    async function authorize(c: Integration) {
        mark(c.name, true);
        const r = await connectIntegration(c.name, c.url ?? '');
        mark(c.name, false);
        if (r.status === 'auth_required' && r.authUrl) awaitAuth(c.name, r.authUrl);
        else if (r.status === 'connected') {
            toast.success(r.message);
            await load();
        } else toast.error(r.message);
    }

    async function reconnect(c: Integration) {
        mark(c.name, true);
        const r = await reconnectIntegration(c.name);
        mark(c.name, false);
        r.ok ? toast.success(r.message) : toast.error(r.message);
        await load();
    }

    async function remove(name: string) {
        await disconnectIntegration(name);
        toast.success(`Removed ${name}`);
        await load();
    }
</script>

<div class="min-h-screen bg-background text-foreground">
    <div class="mx-auto max-w-3xl px-6 py-10">
        <div class="mb-8 flex items-center justify-between">
            <div>
                <h1 class="text-gradient-nero font-display text-2xl font-semibold">Protocols</h1>
                <p class="mt-1 text-sm text-muted-foreground">External systems Nero can reach</p>
            </div>
            <div class="flex items-center gap-3">
                <a href="/" class="text-sm text-muted-foreground hover:text-foreground">← Chat</a>
                <Button onclick={openNew} class="gap-2"><Plus class="h-4 w-4" /> New</Button>
            </div>
        </div>

        {#if loading}
            <div class="flex justify-center py-20"><Loader2 class="h-6 w-6 animate-spin text-primary" /></div>
        {:else if conns.length === 0}
            <div class="flex flex-col items-center justify-center rounded-2xl border border-border/40 py-16 text-center">
                <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border/50 bg-muted/30">
                    <Plug class="h-6 w-6 text-muted-foreground" />
                </div>
                <p class="text-foreground">No protocols connected</p>
                <p class="mb-5 mt-1 max-w-xs text-sm text-muted-foreground">Connect an MCP server to extend what Nero can do.</p>
                <Button onclick={openNew} class="gap-2"><Plus class="h-4 w-4" /> Connect one</Button>
            </div>
        {:else}
            <div class="space-y-2.5">
                {#each conns as c (c.name)}
                    {@const isExp = expanded.has(c.name)}
                    {@const wait = pending.has(c.name)}
                    <div class="rounded-xl border border-border/40 bg-gradient-to-br from-card/70 to-card/30 transition-colors hover:border-primary/30">
                        <div class="flex items-start justify-between gap-3 p-4">
                            <button type="button" class="flex flex-1 items-start gap-3 text-left" onclick={() => toggleExpand(c.name)}>
                                <span class="mt-1 text-muted-foreground">
                                    {#if isExp}<ChevronDown class="h-4 w-4" />{:else}<ChevronRight class="h-4 w-4" />{/if}
                                </span>
                                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-gradient-to-br from-primary/20 to-primary/5">
                                    {#if c.transport === 'stdio'}<Terminal class="h-5 w-5 text-primary" />{:else}<Globe class="h-5 w-5 text-primary" />{/if}
                                </span>
                                <span class="min-w-0 flex-1">
                                    <span class="flex items-center gap-2">
                                        <span class="font-medium">{c.name}</span>
                                        <span class="h-2 w-2 rounded-full {c.connected ? 'bg-green-400' : 'bg-muted-foreground/40'}"></span>
                                    </span>
                                    <span class="mt-0.5 block truncate font-mono text-xs text-muted-foreground">{c.url}</span>
                                    {#if c.connected}
                                        <span class="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><Cpu class="h-3 w-3 text-primary/70" /> {c.tools.length} tools</span>
                                    {/if}
                                </span>
                            </button>
                            <div class="flex items-center gap-1">
                                {#if c.connected}
                                    <Button variant="ghost" size="icon" class="h-8 w-8 text-muted-foreground" title="Reconnect" onclick={() => reconnect(c)}>
                                        <RefreshCw class={cn('h-4 w-4', wait && 'animate-spin')} />
                                    </Button>
                                {:else if c.hasAuth}
                                    <Button variant="outline" size="sm" class="h-7 gap-1.5 text-xs" disabled={wait} onclick={() => reconnect(c)}>
                                        {#if wait}<Loader2 class="h-3 w-3 animate-spin" />{:else}<RefreshCw class="h-3 w-3" />{/if} Reconnect
                                    </Button>
                                {:else}
                                    <Button variant="outline" size="sm" class="h-7 gap-1.5 text-xs" disabled={wait} onclick={() => authorize(c)}>
                                        {#if wait}<Loader2 class="h-3 w-3 animate-spin" /> Waiting…{:else}<Lock class="h-3 w-3" /> Authorize{/if}
                                    </Button>
                                {/if}
                                <Button variant="ghost" size="icon" class="h-8 w-8 text-muted-foreground hover:text-red-400" title="Remove" onclick={() => remove(c.name)}>
                                    <Trash2 class="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                        {#if isExp && c.tools.length > 0}
                            <div class="border-t border-border/30 px-4 pb-4 pt-3">
                                <div class="flex flex-wrap gap-1.5">
                                    {#each c.tools as t}
                                        <span class="rounded-md border border-primary/20 bg-primary/10 px-2 py-1 font-mono text-xs text-primary/80">{t}</span>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}
    </div>

    <!-- create slideover -->
    <Sheet.Root bind:open={panelOpen}>
        <Sheet.Content side="right" class="w-full border-border/50 bg-card sm:max-w-md">
            <Sheet.Header>
                <Sheet.Title>New protocol</Sheet.Title>
                <Sheet.Description>Connect an MCP server. Leave the key blank to use OAuth.</Sheet.Description>
            </Sheet.Header>
            <div class="space-y-4 px-1 py-5">
                <div class="flex gap-2">
                    {#each presets as p}
                        <button type="button" onclick={() => usePreset(p)} class="rounded-lg border border-border/40 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground">{p.label}</button>
                    {/each}
                </div>
                <div>
                    <label for="p-name" class="mb-1.5 block text-sm font-medium">Name</label>
                    <input id="p-name" bind:value={fName} placeholder="lux" autocomplete="off" data-1p-ignore data-lpignore="true" class="w-full rounded-lg border border-border/40 bg-background/60 px-3 py-2 text-sm focus:border-primary/50 focus:outline-none" />
                </div>
                <div>
                    <label for="p-url" class="mb-1.5 block text-sm font-medium">MCP server URL</label>
                    <input id="p-url" bind:value={fUrl} placeholder="https://api.luxdb.dev/mcp" autocomplete="off" data-1p-ignore data-lpignore="true" class="w-full rounded-lg border border-border/40 bg-background/60 px-3 py-2 font-mono text-sm focus:border-primary/50 focus:outline-none" />
                </div>
                <div>
                    <label for="p-key" class="mb-1.5 block text-sm font-medium">API key <span class="text-muted-foreground/60">(optional)</span></label>
                    <input id="p-key" bind:value={fKey} placeholder="leave blank for OAuth" autocomplete="off" data-1p-ignore data-lpignore="true" class="w-full rounded-lg border border-border/40 bg-background/60 px-3 py-2 font-mono text-sm focus:border-primary/50 focus:outline-none" />
                </div>
            </div>
            <Sheet.Footer>
                <Button onclick={save} disabled={busy || !fName.trim() || !fUrl.trim()} class="gap-2">
                    {#if busy}<Loader2 class="h-4 w-4 animate-spin" />{/if} Connect
                </Button>
            </Sheet.Footer>
        </Sheet.Content>
    </Sheet.Root>
</div>
