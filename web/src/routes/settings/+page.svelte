<script lang="ts">
    import { onMount } from 'svelte';
    import {
        getSettings,
        updateSettings,
        getAllowedTools,
        revokeAllowedTool,
        type NeroConfig
    } from '$lib/actions/settings';
    import {
        getServerInfo,
        checkForUpdates,
        getEnvVars,
        updateEnvVars,
        restartService,
        type ServerInfo,
        type UpdateInfo,
        type EnvInfo
    } from '$lib/actions/health';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { toast } from 'svelte-sonner';
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
    import RefreshCw from '@lucide/svelte/icons/refresh-cw';
    import Terminal from '@lucide/svelte/icons/terminal';
    import ArrowUp from '@lucide/svelte/icons/arrow-up';
    import Save from '@lucide/svelte/icons/save';
    import { cn } from '$lib/utils';

    const envVarsMeta = [
        { name: 'OPENROUTER_API_KEY', required: true, description: 'OpenRouter API key for LLM access' },
        { name: 'DATABASE_URL', required: false, description: 'PostgreSQL connection string' },
        { name: 'NERO_LICENSE_KEY', required: false, description: 'Pompeii Labs license for voice/SMS' },
        { name: 'ELEVENLABS_API_KEY', required: false, description: 'ElevenLabs API key for TTS' },
        { name: 'DEEPGRAM_API_KEY', required: false, description: 'Deepgram API key for STT' },
        { name: 'TAVILY_API_KEY', required: false, description: 'Tavily API key for web search' },
    ];

    async function copyToClipboard(text: string) {
        await navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard');
    }

    let config: NeroConfig | null = $state(null);
    let serverInfo: ServerInfo | null = $state(null);
    let updateInfo: UpdateInfo | null = $state(null);
    let envInfo: EnvInfo | null = $state(null);
    let allowedTools: string[] = $state([]);
    let loading = $state(true);

    let historyLimit = $state(20);
    let savingSettings = $state(false);

    let envValues: Record<string, string> = $state({});
    let savingEnv = $state(false);
    let restarting = $state(false);
    let envDirty = $state(false);

    onMount(async () => {
        await loadData();
    });

    async function loadData() {
        loading = true;

        const [configRes, serverRes, toolsRes, updateRes, envRes] = await Promise.all([
            getSettings(),
            getServerInfo(),
            getAllowedTools(),
            checkForUpdates(),
            getEnvVars()
        ]);

        if (configRes.success) {
            config = configRes.data;
            historyLimit = config.settings.historyLimit;
        }

        if (serverRes.success) {
            serverInfo = serverRes.data;
        }

        if (toolsRes.success) {
            allowedTools = toolsRes.data;
        }

        if (updateRes.success) {
            updateInfo = updateRes.data;
        }

        if (envRes.success) {
            envInfo = envRes.data;
            for (const key of envVarsMeta.map(e => e.name)) {
                envValues[key] = '';
            }
        }

        loading = false;
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

    function handleEnvChange(key: string, value: string) {
        envValues[key] = value;
        envDirty = true;
    }

    async function handleSaveEnv() {
        savingEnv = true;
        const toSave: Record<string, string> = {};
        for (const [key, value] of Object.entries(envValues)) {
            if (value.trim() !== '') {
                toSave[key] = value;
            }
        }
        const response = await updateEnvVars(toSave);
        if (response.success) {
            toast.success('Environment saved. Restart to apply changes.');
            envDirty = false;
            await loadData();
        } else {
            toast.error('Failed to save environment');
        }
        savingEnv = false;
    }

    async function handleRestart() {
        restarting = true;
        const response = await restartService();
        if (response.success) {
            toast.success('Restarting Nero...');
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            toast.error('Failed to restart');
            restarting = false;
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
                {#if updateInfo?.updateAvailable}
                    <div
                        class="rounded-xl border border-primary/50 bg-gradient-to-br from-primary/10 to-primary/5 overflow-hidden opacity-0 animate-[floatUp_0.4s_ease-out_forwards]"
                    >
                        <div class="p-4">
                            <div class="flex items-center gap-3">
                                <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/30">
                                    <ArrowUp class="h-5 w-5 text-primary" />
                                </div>
                                <div class="flex-1">
                                    <h2 class="font-medium text-foreground">Update Available</h2>
                                    <p class="text-xs text-muted-foreground">
                                        v{updateInfo.latest} is available (you have v{updateInfo.current})
                                    </p>
                                </div>
                                <div class="flex items-center gap-2">
                                    <code class="px-3 py-1.5 rounded-md bg-background border border-border font-mono text-sm text-foreground">
                                        nero update
                                    </code>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        class="h-8 w-8 shrink-0"
                                        onclick={() => copyToClipboard('nero update')}
                                    >
                                        <Copy class="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                {/if}

                <div
                    class="rounded-xl border border-border/50 bg-gradient-to-br from-card/80 to-card/40 overflow-hidden opacity-0 animate-[floatUp_0.4s_ease-out_forwards]"
                    style="animation-delay: 0ms"
                >
                    <div class="p-4 border-b border-border/30">
                        <div class="flex items-center gap-3">
                            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-green-500/20 to-green-500/5 border border-green-500/30 dark:border-green-500/20">
                                <Activity class="h-5 w-5 text-green-600 dark:text-green-400" />
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
                                            <Check class="h-4 w-4 text-green-600 dark:text-green-400" />
                                            <span class="text-sm text-green-600 dark:text-green-400">Enabled</span>
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
                                            <Check class="h-4 w-4 text-green-600 dark:text-green-400" />
                                            <span class="text-sm text-green-600 dark:text-green-400">Enabled</span>
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
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 border border-cyan-500/30 dark:border-cyan-500/20">
                                    <Terminal class="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                                </div>
                                <div>
                                    <h2 class="font-medium text-foreground">Environment Variables</h2>
                                    <p class="text-xs text-muted-foreground">
                                        {#if envInfo?.path}
                                            Stored in <code class="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">{envInfo.path}</code>
                                        {:else}
                                            API keys and configuration
                                        {/if}
                                    </p>
                                </div>
                            </div>
                            <Button onclick={handleSaveEnv} disabled={savingEnv || !envDirty} class="gap-2">
                                {#if savingEnv}
                                    <Loader2 class="h-4 w-4 animate-spin" />
                                {:else}
                                    <Save class="h-4 w-4" />
                                {/if}
                                Save
                            </Button>
                        </div>
                    </div>
                    <div class="p-4 space-y-3">
                        {#each envVarsMeta as env, i}
                            <div
                                class="rounded-lg bg-muted/30 border border-border/30 p-3 opacity-0 animate-[floatUp_0.3s_ease-out_forwards]"
                                style="animation-delay: {i * 30}ms"
                            >
                                <div class="flex items-center gap-2 mb-2">
                                    <code class="font-mono text-sm text-foreground">{env.name}</code>
                                    {#if env.required}
                                        <span class="rounded-full bg-red-500/20 border border-red-500/40 dark:border-red-500/30 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400 uppercase tracking-wide">
                                            Required
                                        </span>
                                    {:else}
                                        <span class="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                                            Optional
                                        </span>
                                    {/if}
                                    {#if envInfo?.env[env.name]?.isSet}
                                        <span class="rounded-full bg-green-500/20 border border-green-500/40 dark:border-green-500/30 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400 uppercase tracking-wide ml-auto flex items-center gap-1">
                                            <Check class="h-3 w-3" />
                                            Set
                                        </span>
                                    {:else}
                                        <span class="rounded-full bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide ml-auto">
                                            Not Set
                                        </span>
                                    {/if}
                                </div>
                                <Input
                                    type="password"
                                    placeholder={envInfo?.env[env.name]?.isSet ? '••••••••  (leave blank to keep current)' : env.description}
                                    value={envValues[env.name] || ''}
                                    oninput={(e) => handleEnvChange(env.name, e.currentTarget.value)}
                                    class="font-mono text-sm bg-background/50 border-border/50 focus:border-primary/50"
                                />
                            </div>
                        {/each}
                        {#if envDirty}
                            <div class="rounded-lg bg-amber-500/10 border border-amber-500/30 dark:border-amber-500/20 p-3">
                                <p class="text-xs text-amber-600 dark:text-amber-400">
                                    You have unsaved changes. Save and restart to apply.
                                </p>
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
                            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-500/5 border border-blue-500/30 dark:border-blue-500/20">
                                <Server class="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                                <h2 class="font-medium text-foreground">Service Control</h2>
                                <p class="text-xs text-muted-foreground">Restart Nero to apply configuration changes</p>
                            </div>
                        </div>
                    </div>
                    <div class="p-4">
                        <Button onclick={handleRestart} disabled={restarting} variant="outline" class="gap-2">
                            {#if restarting}
                                <Loader2 class="h-4 w-4 animate-spin" />
                                Restarting...
                            {:else}
                                <RefreshCw class="h-4 w-4" />
                                Restart Service
                            {/if}
                        </Button>
                        <p class="mt-2 text-xs text-muted-foreground">
                            Restart is required after changing environment variables.
                        </p>
                    </div>
                </div>

                <div
                    class="rounded-xl border border-border/50 bg-gradient-to-br from-card/80 to-card/40 overflow-hidden opacity-0 animate-[floatUp_0.4s_ease-out_forwards]"
                    style="animation-delay: 150ms"
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
                    style="animation-delay: 200ms"
                >
                    <div class="p-4 border-b border-border/30">
                        <div class="flex items-center gap-3">
                            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/20 to-violet-500/5 border border-violet-500/30 dark:border-violet-500/20">
                                <Shield class="h-5 w-5 text-violet-600 dark:text-violet-400" />
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
                                        style="animation-delay: {250 + i * 30}ms"
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
