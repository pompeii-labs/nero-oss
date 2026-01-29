<script lang="ts">
    import { onMount } from 'svelte';
    import {
        getSettings,
        updateSettings,
        updateLicenseKey,
        getAllowedTools,
        revokeAllowedTool,
        type NeroConfig
    } from '$lib/actions/settings';
    import { getServerInfo, type ServerInfo } from '$lib/actions/health';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { toast } from 'svelte-sonner';
    import Key from '@lucide/svelte/icons/key';
    import Server from '@lucide/svelte/icons/server';
    import Shield from '@lucide/svelte/icons/shield';
    import Trash2 from '@lucide/svelte/icons/trash-2';
    import Loader2 from '@lucide/svelte/icons/loader-2';
    import Check from '@lucide/svelte/icons/check';
    import X from '@lucide/svelte/icons/x';
    import Sliders from '@lucide/svelte/icons/sliders';
    import Zap from '@lucide/svelte/icons/zap';
    import Activity from '@lucide/svelte/icons/activity';
    import Copy from '@lucide/svelte/icons/copy';
    import { cn } from '$lib/utils';

    async function copyTunnelUrl() {
        if (config?.tunnelUrl) {
            await navigator.clipboard.writeText(config.tunnelUrl);
            toast.success('Tunnel URL copied');
        }
    }

    let config: NeroConfig | null = $state(null);
    let serverInfo: ServerInfo | null = $state(null);
    let allowedTools: string[] = $state([]);
    let loading = $state(true);

    let licenseKey = $state('');
    let savingLicense = $state(false);

    let historyLimit = $state(20);
    let savingSettings = $state(false);

    onMount(async () => {
        await loadData();
    });

    async function loadData() {
        loading = true;

        const [configRes, serverRes, toolsRes] = await Promise.all([
            getSettings(),
            getServerInfo(),
            getAllowedTools()
        ]);

        if (configRes.success) {
            config = configRes.data;
            licenseKey = config.licenseKey || '';
            historyLimit = config.settings.historyLimit;
        }

        if (serverRes.success) {
            serverInfo = serverRes.data;
        }

        if (toolsRes.success) {
            allowedTools = toolsRes.data;
        }

        loading = false;
    }

    async function handleSaveLicense() {
        savingLicense = true;
        const response = await updateLicenseKey(licenseKey.trim() || null);
        if (response.success) {
            toast.success('License key updated');
        } else {
            toast.error('Failed to update license key');
        }
        savingLicense = false;
    }

    async function handleSaveSettings() {
        savingSettings = true;
        const response = await updateSettings({ historyLimit });
        if (response.success) {
            toast.success('Settings saved');
        } else {
            toast.error('Failed to save settings');
        }
        savingSettings = false;
    }

    async function handleRevokeTool(tool: string) {
        const response = await revokeAllowedTool(tool);
        if (response.success) {
            allowedTools = allowedTools.filter(t => t !== tool);
            toast.success('Tool permission revoked');
        } else {
            toast.error('Failed to revoke tool');
        }
    }
</script>

<div class="flex h-full flex-col">
    <div class="border-b border-border/50 bg-card/30 backdrop-blur-sm p-6">
        <div class="mx-auto max-w-4xl">
            <h1 class="text-2xl font-semibold tracking-tight">
                <span class="text-gradient-nero">Settings</span>
            </h1>
            <p class="text-sm text-muted-foreground mt-1">Configure Nero preferences</p>
        </div>
    </div>

    <div class="flex-1 overflow-y-auto">
        <div class="mx-auto max-w-4xl space-y-4 p-6">
            {#if loading}
                <div class="flex flex-col items-center justify-center py-20">
                    <div class="relative">
                        <div class="absolute inset-0 blur-2xl bg-primary/20 rounded-full"></div>
                        <Loader2 class="relative h-8 w-8 animate-spin text-primary" />
                    </div>
                    <p class="mt-4 text-sm text-muted-foreground">Loading settings...</p>
                </div>
            {:else}
                <div
                    class="rounded-xl border border-border/50 bg-gradient-to-br from-card/80 to-card/40 overflow-hidden opacity-0 animate-[floatUp_0.4s_ease-out_forwards]"
                    style="animation-delay: 0ms"
                >
                    <div class="p-4 border-b border-border/30">
                        <div class="flex items-center gap-3">
                            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-green-500/20 to-green-500/5 border border-green-500/20">
                                <Activity class="h-5 w-5 text-green-400" />
                            </div>
                            <div>
                                <h2 class="font-medium text-foreground">Server Status</h2>
                                <p class="text-xs text-muted-foreground">Current Nero instance information</p>
                            </div>
                        </div>
                    </div>
                    <div class="p-4">
                        {#if serverInfo}
                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                <div class="rounded-lg bg-muted/30 border border-border/30 p-3">
                                    <span class="text-xs text-muted-foreground uppercase tracking-wide">Version</span>
                                    <p class="font-mono text-sm mt-1 text-foreground">{serverInfo.version}</p>
                                </div>
                                <div class="rounded-lg bg-muted/30 border border-border/30 p-3">
                                    <span class="text-xs text-muted-foreground uppercase tracking-wide">Status</span>
                                    <p class="flex items-center gap-2 mt-1">
                                        <span class="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                                        <span class="text-sm text-foreground">{serverInfo.status}</span>
                                    </p>
                                </div>
                                <div class="rounded-lg bg-muted/30 border border-border/30 p-3">
                                    <span class="text-xs text-muted-foreground uppercase tracking-wide">Voice</span>
                                    <p class="flex items-center gap-2 mt-1">
                                        {#if serverInfo.features.voice}
                                            <Check class="h-4 w-4 text-green-400" />
                                            <span class="text-sm text-green-400">Enabled</span>
                                        {:else}
                                            <X class="h-4 w-4 text-muted-foreground" />
                                            <span class="text-sm text-muted-foreground">Disabled</span>
                                        {/if}
                                    </p>
                                </div>
                                <div class="rounded-lg bg-muted/30 border border-border/30 p-3">
                                    <span class="text-xs text-muted-foreground uppercase tracking-wide">SMS</span>
                                    <p class="flex items-center gap-2 mt-1">
                                        {#if serverInfo.features.sms}
                                            <Check class="h-4 w-4 text-green-400" />
                                            <span class="text-sm text-green-400">Enabled</span>
                                        {:else}
                                            <X class="h-4 w-4 text-muted-foreground" />
                                            <span class="text-sm text-muted-foreground">Disabled</span>
                                        {/if}
                                    </p>
                                </div>
                            </div>
                        {:else}
                            <p class="text-sm text-muted-foreground">Could not load server info</p>
                        {/if}
                    </div>
                </div>

                <div
                    class="rounded-xl border border-border/50 bg-gradient-to-br from-card/80 to-card/40 overflow-hidden opacity-0 animate-[floatUp_0.4s_ease-out_forwards]"
                    style="animation-delay: 50ms"
                >
                    <div class="p-4 border-b border-border/30">
                        <div class="flex items-center gap-3">
                            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/20">
                                <Key class="h-5 w-5 text-amber-400" />
                            </div>
                            <div>
                                <h2 class="font-medium text-foreground">License Key</h2>
                                <p class="text-xs text-muted-foreground">Enables voice calls, SMS, and webhook routing</p>
                            </div>
                        </div>
                    </div>
                    <div class="p-4">
                        <div class="flex gap-2">
                            <Input
                                type="password"
                                placeholder="Enter license key..."
                                bind:value={licenseKey}
                                class="font-mono bg-muted/50 border-border/50 focus:border-primary/50"
                            />
                            <Button onclick={handleSaveLicense} disabled={savingLicense} class="gap-2">
                                {#if savingLicense}
                                    <Loader2 class="h-4 w-4 animate-spin" />
                                {/if}
                                Save
                            </Button>
                        </div>
                        {#if config?.tunnelUrl}
                            <div class="mt-3 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 flex items-center justify-between gap-2">
                                <div class="min-w-0">
                                    <span class="text-xs text-muted-foreground">Tunnel URL: </span>
                                    <span class="font-mono text-xs text-primary break-all">{config.tunnelUrl}</span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    class="h-7 w-7 shrink-0 text-primary/70 hover:text-primary hover:bg-primary/10"
                                    onclick={copyTunnelUrl}
                                >
                                    <Copy class="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        {/if}
                    </div>
                </div>

                <div
                    class="rounded-xl border border-border/50 bg-gradient-to-br from-card/80 to-card/40 overflow-hidden opacity-0 animate-[floatUp_0.4s_ease-out_forwards]"
                    style="animation-delay: 100ms"
                >
                    <div class="p-4 border-b border-border/30">
                        <div class="flex items-center gap-3">
                            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                                <Sliders class="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <h2 class="font-medium text-foreground">General Settings</h2>
                                <p class="text-xs text-muted-foreground">Configure Nero behavior</p>
                            </div>
                        </div>
                    </div>
                    <div class="p-4 space-y-4">
                        <div>
                            <label for="history-limit" class="mb-1.5 block text-sm font-medium text-foreground">History Limit</label>
                            <div class="flex items-center gap-3">
                                <Input
                                    id="history-limit"
                                    type="number"
                                    bind:value={historyLimit}
                                    min={5}
                                    max={100}
                                    class="w-24 bg-muted/50 border-border/50 focus:border-primary/50"
                                />
                                <span class="text-sm text-muted-foreground">messages</span>
                            </div>
                            <p class="mt-1.5 text-xs text-muted-foreground">
                                Number of recent messages to load at startup
                            </p>
                        </div>
                        <Button onclick={handleSaveSettings} disabled={savingSettings} class="gap-2">
                            {#if savingSettings}
                                <Loader2 class="h-4 w-4 animate-spin" />
                            {/if}
                            Save Settings
                        </Button>
                    </div>
                </div>

                <div
                    class="rounded-xl border border-border/50 bg-gradient-to-br from-card/80 to-card/40 overflow-hidden opacity-0 animate-[floatUp_0.4s_ease-out_forwards]"
                    style="animation-delay: 150ms"
                >
                    <div class="p-4 border-b border-border/30">
                        <div class="flex items-center gap-3">
                            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/20 to-violet-500/5 border border-violet-500/20">
                                <Shield class="h-5 w-5 text-violet-400" />
                            </div>
                            <div>
                                <h2 class="font-medium text-foreground">Allowed Tools</h2>
                                <p class="text-xs text-muted-foreground">Pre-approved tools that won't require permission</p>
                            </div>
                        </div>
                    </div>
                    <div class="p-4">
                        {#if allowedTools.length === 0}
                            <div class="flex flex-col items-center justify-center py-8 text-center">
                                <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50 border border-border/50 mb-3">
                                    <Zap class="h-6 w-6 text-muted-foreground" />
                                </div>
                                <p class="text-sm text-muted-foreground">No tools have been pre-approved yet.</p>
                                <p class="text-xs text-muted-foreground/70 mt-1">Approve tools during chat to add them here.</p>
                            </div>
                        {:else}
                            <div class="space-y-2">
                                {#each allowedTools as tool, i}
                                    <div
                                        class="group flex items-center justify-between rounded-lg bg-muted/30 border border-border/30 px-3 py-2.5 transition-all hover:border-primary/30 hover:bg-muted/50 opacity-0 animate-[floatUp_0.3s_ease-out_forwards]"
                                        style="animation-delay: {200 + i * 30}ms"
                                    >
                                        <span class="font-mono text-sm text-foreground/90">{tool}</span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            class="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all"
                                            onclick={() => handleRevokeTool(tool)}
                                        >
                                            <Trash2 class="h-4 w-4" />
                                        </Button>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div>
