<script lang="ts">
    import { onMount } from "svelte";
    import { Button } from "$components/ui/button";
    import { Input } from "$components/ui/input";
    import { getModelSettings, updateModelSettings } from "$lib/actions/settings";
    import { updateEnvVars } from "$lib/actions/health";
    import { getEnvVars } from "$lib/actions/health";
    import Cpu from "@lucide/svelte/icons/cpu";
    import LoaderCircle from "@lucide/svelte/icons/loader-circle";
    import Check from "@lucide/svelte/icons/check";
    import ChevronDown from "@lucide/svelte/icons/chevron-down";
    import ChevronUp from "@lucide/svelte/icons/chevron-up";
    import { toast } from "svelte-sonner";

    let { isContainedMode = false, onSaved }: { isContainedMode?: boolean; onSaved?: () => void } = $props();

    let modelValue = $state('');
    let baseUrlValue = $state('');
    let openRouterApiKeyValue = $state('');
    let openRouterApiKeyIsSet = $state(false);
    let loading = $state(true);
    let expanded = $state(true);

    let savingModel = $state(false);
    const canCollapse = $derived(modelValue.trim().length > 0 && openRouterApiKeyIsSet);

    onMount(async () => {
        const [modelRes, envRes] = await Promise.all([getModelSettings(), getEnvVars()]);

        if (modelRes.success) {
            modelValue = modelRes.data.model || '';
            baseUrlValue = modelRes.data.baseUrl || '';
        }
        if (envRes.success) {
            openRouterApiKeyIsSet = envRes.data.env.OPENROUTER_API_KEY?.isSet || false;
            openRouterApiKeyValue = '';
        }

        expanded = !canCollapse;
        loading = false;
    });

    function toggleExpanded() {
        if (expanded && !canCollapse) {
            toast.info('Set model and OPENROUTER_API_KEY before collapsing this section.');
            return;
        }
        expanded = !expanded;
    }

    async function handleSaveModel() {
        if (isContainedMode) {
            toast.info('Contained mode: set environment variables in your deployment.');
            return;
        }

        savingModel = true;
        const modelResponse = await updateModelSettings(
            modelValue,
            baseUrlValue.trim() ? baseUrlValue.trim() : undefined,
        );
        if (!modelResponse.success) {
            toast.error('Failed to save model settings');
            savingModel = false;
            return;
        }

        if (openRouterApiKeyValue.trim()) {
            const envResponse = await updateEnvVars({
                OPENROUTER_API_KEY: openRouterApiKeyValue.trim(),
            });
            if (!envResponse.success) {
                toast.error('Model saved, but failed to save OPENROUTER_API_KEY');
                savingModel = false;
                return;
            }
            openRouterApiKeyIsSet = true;
        }

        toast.success('Model settings saved. Restart to apply.');
        openRouterApiKeyValue = '';
        if (canCollapse) expanded = false;
        onSaved?.();
        savingModel = false;
    }
</script>

<div
    class="rounded-xl border border-border/50 bg-linear-to-br from-card/80 to-card/40 overflow-hidden opacity-0 animate-[floatUp_0.4s_ease-out_forwards]"
    style="animation-delay: 150ms"
>
    <div class="p-4 border-b border-border/30">
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-linear-to-br from-orange-500/20 to-orange-500/5 border border-orange-500/30 dark:border-orange-500/20">
                    <Cpu class="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                    <h2 class="font-medium text-foreground">Model & Provider</h2>
                    <p class="text-xs text-muted-foreground">Configure LLM model and API endpoint</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                {#if canCollapse}
                    <span class="rounded-full bg-green-500/20 border border-green-500/40 dark:border-green-500/30 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400 uppercase tracking-wide">
                        Complete
                    </span>
                {/if}
                <Button variant="outline" size="icon" onclick={toggleExpanded} class="h-8 w-8">
                    {#if expanded}
                        <ChevronUp class="h-4 w-4" />
                    {:else}
                        <ChevronDown class="h-4 w-4" />
                    {/if}
                </Button>
                {#if !isContainedMode}
                    <Button onclick={handleSaveModel} disabled={savingModel} class="gap-2">
                        {#if savingModel}
                            <LoaderCircle class="h-4 w-4 animate-spin" />
                        {/if}
                        Save
                    </Button>
                {/if}
            </div>
        </div>
    </div>
    {#if expanded}
    <div class="p-4 space-y-4">
        {#if isContainedMode}
        {#if loading}
            <p class="text-sm text-muted-foreground">Loading model settings...</p>
        {:else}
        <div class="space-y-3">
            <p class="text-sm text-muted-foreground">
                Contained mode is read-only in the dashboard. Configure settings via environment variables.
            </p>
            <div class="rounded-md border border-border/50 bg-background/40 p-3 space-y-2">
                <p class="text-xs font-medium text-foreground">Current settings</p>
                <p class="text-xs text-muted-foreground">
                    Model:
                    <span class="text-foreground font-medium">{modelValue || 'Not set'}</span>
                </p>
                <p class="text-xs text-muted-foreground">
                    Base URL:
                    <span class="text-foreground font-medium">{baseUrlValue || 'Default (OpenRouter)'}</span>
                </p>
                <p class="text-xs text-muted-foreground flex items-center gap-2">
                    OPENROUTER_API_KEY:
                    <span class="text-foreground font-medium">{openRouterApiKeyIsSet ? 'Set' : 'Not set'}</span>
                </p>
            </div>
            <div class="rounded-md border border-border/50 bg-background/40 p-3 space-y-1">
                <p class="text-xs font-medium text-foreground">Config via CLI</p>
                <code class="block text-xs font-mono">nero config set llm.model anthropic/claude-sonnet-4</code>
                <code class="block text-xs font-mono">nero config set llm.baseUrl https://...</code>
            </div>
            <div class="rounded-md border border-border/50 bg-background/40 p-3 space-y-1">
                <p class="text-xs font-medium text-foreground">Secrets</p>
                <code class="block text-xs font-mono">OPENROUTER_API_KEY=&lt;key&gt;</code>
                <p class="text-xs text-muted-foreground">Set in your container/app platform environment.</p>
            </div>
            <div class="rounded-md border border-border/50 bg-background/40 p-3 space-y-1">
                <p class="text-xs font-medium text-foreground">Apply</p>
                <code class="block text-xs font-mono">restart the container</code>
            </div>
        </div>
        {/if}
        {:else if loading}
            <p class="text-sm text-muted-foreground">Loading model settings...</p>
        {:else}
        <div>
            <label for="model" class="mb-1.5 block text-sm font-medium text-foreground">Model</label>
            <Input
                id="model"
                type="text"
                bind:value={modelValue}
                placeholder="anthropic/claude-sonnet-4"
                class="font-mono text-sm bg-muted/50 border-border/50 focus:border-primary/50"
            />
            <p class="mt-1.5 text-xs text-muted-foreground">
                OpenRouter model ID or local model name (e.g. llama3.2:3b)
            </p>
        </div>
        <div>
            <label for="base-url" class="mb-1.5 block text-sm font-medium text-foreground">Base URL</label>
            <Input
                id="base-url"
                type="text"
                bind:value={baseUrlValue}
                placeholder="Leave blank for OpenRouter (default)"
                class="font-mono text-sm bg-muted/50 border-border/50 focus:border-primary/50"
            />
            <p class="mt-1.5 text-xs text-muted-foreground">
                Custom OpenAI-compatible endpoint. Leave blank to use OpenRouter.
            </p>
        </div>
        <div>
            <div class="mb-1.5 flex items-center gap-2">
                <label for="openrouter-api-key" class="block text-sm font-medium text-foreground">OPENROUTER_API_KEY</label>
                {#if openRouterApiKeyIsSet}
                    <span class="rounded-full bg-green-500/20 border border-green-500/40 dark:border-green-500/30 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400 uppercase tracking-wide flex items-center gap-1">
                        <Check class="h-3 w-3" />
                        Set
                    </span>
                {/if}
            </div>
            <Input
                id="openrouter-api-key"
                type="password"
                name="model-openrouter-api-key"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
                spellcheck={false}
                bind:value={openRouterApiKeyValue}
                placeholder={openRouterApiKeyIsSet ? '••••••••  (leave blank to keep current)' : 'Required for OpenRouter'}
                class="font-mono text-sm bg-muted/50 border-border/50 focus:border-primary/50"
            />
            <p class="mt-1.5 text-xs text-muted-foreground">
                Saved with model settings when provided.
            </p>
        </div>
        {/if}
    </div>
    {:else}
    <div class="p-4">
        <p class="text-sm text-muted-foreground">
            Model: <span class="text-foreground font-medium">{modelValue}</span> · OPENROUTER_API_KEY set
        </p>
    </div>
    {/if}
</div>
