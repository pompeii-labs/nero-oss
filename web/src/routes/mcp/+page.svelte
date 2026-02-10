<script lang="ts">
    import { onMount } from 'svelte';
    import {
        getMcpServers,
        addMcpServer,
        removeMcpServer,
        toggleMcpServer,
        type McpServerConfig
    } from '$lib/actions/mcp';
    import { reloadConfig } from '$lib/actions/health';
    import * as Dialog from '$lib/components/ui/dialog';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { Separator } from '$lib/components/ui/separator';
    import { toast } from 'svelte-sonner';
    import Puzzle from '@lucide/svelte/icons/puzzle';
    import Plus from '@lucide/svelte/icons/plus';
    import Trash2 from '@lucide/svelte/icons/trash-2';
    import Power from '@lucide/svelte/icons/power';
    import PowerOff from '@lucide/svelte/icons/power-off';
    import RefreshCw from '@lucide/svelte/icons/refresh-cw';
    import Terminal from '@lucide/svelte/icons/terminal';
    import Globe from '@lucide/svelte/icons/globe';
    import Wrench from '@lucide/svelte/icons/wrench';
    import Loader2 from '@lucide/svelte/icons/loader-2';
    import ChevronDown from '@lucide/svelte/icons/chevron-down';
    import ChevronRight from '@lucide/svelte/icons/chevron-right';
    import Cpu from '@lucide/svelte/icons/cpu';
    import { cn } from '$lib/utils';

    let servers: Record<string, McpServerConfig> = $state({});
    let tools: string[] = $state([]);
    let loading = $state(true);
    let reloading = $state(false);

    let addDialogOpen = $state(false);
    let newServerName = $state('');
    let newServerCommand = $state('');
    let newServerArgs = $state('');
    let saving = $state(false);

    let expandedServers: Set<string> = $state(new Set());

    onMount(async () => {
        await loadServers();
    });

    async function loadServers() {
        loading = true;
        const response = await getMcpServers();
        if (response.success) {
            servers = response.data.servers;
            tools = response.data.tools;
        } else {
            toast.error('Failed to load MCP servers');
        }
        loading = false;
    }

    async function handleAddServer() {
        if (!newServerName.trim() || !newServerCommand.trim()) return;
        saving = true;

        const args = newServerArgs.trim() ? newServerArgs.trim().split(/\s+/) : [];
        const config: McpServerConfig = {
            transport: 'stdio',
            command: newServerCommand.trim(),
            args
        };

        const response = await addMcpServer(newServerName.trim(), config);
        if (response.success) {
            await loadServers();
            newServerName = '';
            newServerCommand = '';
            newServerArgs = '';
            addDialogOpen = false;
            toast.success('MCP server added');
        } else {
            toast.error('Failed to add MCP server');
        }
        saving = false;
    }

    async function handleRemoveServer(name: string) {
        const response = await removeMcpServer(name);
        if (response.success) {
            const { [name]: _, ...rest } = servers;
            servers = rest;
            toast.success('MCP server removed');
        } else {
            toast.error('Failed to remove MCP server');
        }
    }

    async function handleToggleServer(name: string, currentDisabled: boolean) {
        const response = await toggleMcpServer(name, !currentDisabled);
        if (response.success) {
            servers = {
                ...servers,
                [name]: { ...servers[name], disabled: !currentDisabled }
            };
            toast.success(`MCP server ${!currentDisabled ? 'disabled' : 'enabled'}`);
        } else {
            toast.error('Failed to toggle MCP server');
        }
    }

    async function handleReload() {
        reloading = true;
        const response = await reloadConfig();
        if (response.success) {
            await loadServers();
            toast.success(`Config reloaded with ${response.data.mcpTools} tools`);
        } else {
            toast.error('Failed to reload config');
        }
        reloading = false;
    }

    function toggleExpanded(name: string) {
        const newSet = new Set(expandedServers);
        if (newSet.has(name)) {
            newSet.delete(name);
        } else {
            newSet.add(name);
        }
        expandedServers = newSet;
    }

    function getServerTools(name: string): string[] {
        return tools.filter(t => t.startsWith(`${name}:`));
    }
</script>

<div class="flex h-full flex-col">
    <div class="border-b border-border/50 bg-card/30 backdrop-blur-sm p-6">
        <div class="mx-auto max-w-4xl">
            <div class="flex items-start justify-between gap-4">
                <div>
                    <h1 class="text-2xl font-semibold tracking-tight font-display">
                        <span class="text-gradient-nero">MCP Servers</span>
                    </h1>
                    <p class="text-sm text-muted-foreground mt-1">Manage Model Context Protocol servers</p>
                </div>
                <div class="flex items-center gap-2">
                    <Button variant="outline" onclick={handleReload} disabled={reloading} class="gap-2">
                        <RefreshCw class={cn('h-4 w-4', reloading && 'animate-spin')} />
                        Reload
                    </Button>
                    <Dialog.Root bind:open={addDialogOpen}>
                        <Dialog.Trigger>
                            {#snippet child({ props })}
                                <Button {...props} class="gap-2">
                                    <Plus class="h-4 w-4" />
                                    Add Server
                                </Button>
                            {/snippet}
                        </Dialog.Trigger>
                        <Dialog.Content class="sm:max-w-md border-border/50 bg-card">
                            <Dialog.Header>
                                <Dialog.Title>Add MCP Server</Dialog.Title>
                                <Dialog.Description>
                                    Configure a new MCP server to add tools.
                                </Dialog.Description>
                            </Dialog.Header>
                            <div class="space-y-4 py-4">
                                <div>
                                    <label for="server-name" class="mb-1.5 block text-sm font-medium">Name</label>
                                    <Input
                                        id="server-name"
                                        bind:value={newServerName}
                                        placeholder="e.g., filesystem"
                                        class="bg-muted/50 border-border/50 focus:border-primary/50"
                                    />
                                </div>
                                <div>
                                    <label for="server-command" class="mb-1.5 block text-sm font-medium">Command</label>
                                    <Input
                                        id="server-command"
                                        bind:value={newServerCommand}
                                        placeholder="e.g., npx"
                                        class="bg-muted/50 border-border/50 focus:border-primary/50"
                                    />
                                </div>
                                <div>
                                    <label for="server-args" class="mb-1.5 block text-sm font-medium">Arguments</label>
                                    <Input
                                        id="server-args"
                                        bind:value={newServerArgs}
                                        placeholder="e.g., -y @modelcontextprotocol/server-filesystem /home"
                                        class="bg-muted/50 border-border/50 focus:border-primary/50"
                                    />
                                    <p class="mt-1 text-xs text-muted-foreground">
                                        Space-separated arguments
                                    </p>
                                </div>
                            </div>
                            <Dialog.Footer>
                                <Button variant="outline" onclick={() => (addDialogOpen = false)}>
                                    Cancel
                                </Button>
                                <Button
                                    onclick={handleAddServer}
                                    disabled={saving || !newServerName.trim() || !newServerCommand.trim()}
                                >
                                    {#if saving}
                                        <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                                    {/if}
                                    Add Server
                                </Button>
                            </Dialog.Footer>
                        </Dialog.Content>
                    </Dialog.Root>
                </div>
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
                    <p class="mt-4 text-sm text-muted-foreground">Loading servers...</p>
                </div>
            {:else if Object.keys(servers).length === 0}
                <div class="flex flex-col items-center justify-center py-20 text-center">
                    <div class="relative mb-6">
                        <div class="absolute inset-0 blur-2xl bg-primary/10 rounded-full scale-150"></div>
                        <div class="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-muted to-muted/60 border border-border/50">
                            <Puzzle class="h-8 w-8 text-muted-foreground" />
                        </div>
                    </div>
                    <h2 class="text-lg font-medium text-foreground">No MCP servers configured</h2>
                    <p class="mt-1 mb-6 text-sm text-muted-foreground max-w-sm">
                        Add MCP servers to extend Nero's capabilities with external tools.
                    </p>
                    <Button onclick={() => (addDialogOpen = true)} class="gap-2">
                        <Plus class="h-4 w-4" />
                        Add Server
                    </Button>
                </div>
            {:else}
                <div class="space-y-3">
                    {#each Object.entries(servers) as [name, config], i}
                        {@const serverTools = getServerTools(name)}
                        {@const expanded = expandedServers.has(name)}
                        <div
                            class={cn(
                                "group relative rounded-xl border border-border/50 bg-gradient-to-br from-card/80 to-card/40 transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 opacity-0 animate-[floatUp_0.4s_ease-out_forwards]",
                                config.disabled && "opacity-60"
                            )}
                            style="animation-delay: {Math.min(i * 50, 300)}ms"
                        >
                            <div class="p-4">
                                <div class="flex items-start justify-between gap-3">
                                    <button
                                        type="button"
                                        class="flex flex-1 items-start gap-3 text-left"
                                        onclick={() => toggleExpanded(name)}
                                    >
                                        <div class="mt-0.5 text-muted-foreground">
                                            {#if expanded}
                                                <ChevronDown class="h-4 w-4" />
                                            {:else}
                                                <ChevronRight class="h-4 w-4" />
                                            {/if}
                                        </div>
                                        <div
                                            class={cn(
                                                'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border',
                                                config.transport === 'http'
                                                    ? 'bg-gradient-to-br from-blue-500/20 to-blue-500/5 border-blue-500/20'
                                                    : 'bg-gradient-to-br from-primary/20 to-primary/5 border-primary/20'
                                            )}
                                        >
                                            {#if config.transport === 'http'}
                                                <Globe class="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                            {:else}
                                                <Terminal class="h-5 w-5 text-primary" />
                                            {/if}
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <div class="flex items-center gap-2">
                                                <span class="font-medium text-foreground">{name}</span>
                                                {#if config.disabled}
                                                    <span class="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                                                        Disabled
                                                    </span>
                                                {/if}
                                            </div>
                                            <p class="mt-0.5 text-xs text-muted-foreground font-mono truncate">
                                                {config.command} {config.args?.join(' ') || ''}
                                            </p>
                                            {#if serverTools.length > 0}
                                                <div class="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                                    <Cpu class="h-3 w-3 text-primary/70" />
                                                    <span>{serverTools.length} tool{serverTools.length === 1 ? '' : 's'}</span>
                                                </div>
                                            {/if}
                                        </div>
                                    </button>
                                    <div class="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            class="h-8 w-8"
                                            onclick={() => handleToggleServer(name, config.disabled || false)}
                                        >
                                            {#if config.disabled}
                                                <PowerOff class="h-4 w-4 text-muted-foreground" />
                                            {:else}
                                                <Power class="h-4 w-4 text-green-600 dark:text-green-400" />
                                            {/if}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            class="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                            onclick={() => handleRemoveServer(name)}
                                        >
                                            <Trash2 class="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>

                                {#if expanded && serverTools.length > 0}
                                    <div class="mt-4 pt-4 border-t border-border/30">
                                        <span class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Available Tools</span>
                                        <div class="mt-2 flex flex-wrap gap-1.5">
                                            {#each serverTools as tool}
                                                <span class="rounded-md bg-primary/10 border border-primary/20 px-2 py-1 font-mono text-xs text-primary/80">
                                                    {tool.replace(`${name}:`, '')}
                                                </span>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>

                {#if tools.length > 0}
                    <div class="mt-6 rounded-xl border border-border/50 bg-gradient-to-br from-card/60 to-card/30 p-4">
                        <div class="flex items-center gap-2 text-sm">
                            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
                                <Wrench class="h-4 w-4 text-primary" />
                            </div>
                            <span class="font-medium text-foreground">{tools.length} total tools available</span>
                        </div>
                    </div>
                {/if}
            {/if}
        </div>
    </div>
</div>
