<script lang="ts">
    import { onMount } from "svelte";
    import { Button } from "$components/ui/button";
    import { Input } from "$components/ui/input";
    import {
        getVoiceSettings,
        updateVoiceSettings,
        type STTProvider,
        type STTModel,
    } from "$lib/actions/settings";
    import { getEnvVars, updateEnvVars } from "$lib/actions/health";
    import LoaderCircle from "@lucide/svelte/icons/loader-circle";
    import Mic from "@lucide/svelte/icons/mic";
    import Check from "@lucide/svelte/icons/check";
    import ChevronDown from "@lucide/svelte/icons/chevron-down";
    import ChevronUp from "@lucide/svelte/icons/chevron-up";
    import { toast } from "svelte-sonner";

    let { isContainedMode = false, onSaved }: { isContainedMode?: boolean; onSaved?: () => void } = $props();

    let sttProviderValue = $state<STTProvider>('deepgram');
    let sttModelValue = $state<STTModel>('flux');
    let fluxEotThresholdValue = $state('');
    let fluxEagerEotThresholdValue = $state('');
    let fluxEotTimeoutMsValue = $state('');
    let deepgramApiKeyValue = $state('');
    let deepgramApiKeyIsSet = $state(false);
    let loading = $state(true);
    let savingStt = $state(false);
    let expanded = $state(true);
    const providerApiKeyIsSet = $derived(
        sttProviderValue === 'deepgram' ? deepgramApiKeyIsSet : false,
    );
    const canCollapse = $derived(Boolean(sttProviderValue) && Boolean(sttModelValue) && providerApiKeyIsSet);

    onMount(async () => {
        const [voiceRes, envRes] = await Promise.all([getVoiceSettings(), getEnvVars()]);

        if (voiceRes.success) {
            const voice = voiceRes.data.voice;
            sttProviderValue = voice.stt?.provider || 'deepgram';
            sttModelValue = voice.stt?.model || 'flux';
            fluxEotThresholdValue =
                voice.stt?.flux?.eotThreshold !== undefined
                    ? String(voice.stt.flux.eotThreshold)
                    : '';
            fluxEagerEotThresholdValue =
                voice.stt?.flux?.eagerEotThreshold !== undefined
                    ? String(voice.stt.flux.eagerEotThreshold)
                    : '';
            fluxEotTimeoutMsValue =
                voice.stt?.flux?.eotTimeoutMs !== undefined
                    ? String(voice.stt.flux.eotTimeoutMs)
                    : '';
        }

        if (envRes.success) {
            deepgramApiKeyIsSet = envRes.data.env.DEEPGRAM_API_KEY?.isSet || false;
            deepgramApiKeyValue = '';
        }

        expanded = !canCollapse;
        loading = false;
    });

    function toggleExpanded() {
        if (expanded && !canCollapse) {
            toast.info('Set provider, model, and provider API key before collapsing this section.');
            return;
        }
        expanded = !expanded;
    }

    async function handleSaveStt() {
        if (isContainedMode) {
            toast.info('Contained mode: set environment variables in your deployment.');
            return;
        }

        const updates: {
            stt: {
                provider: 'deepgram';
                model: STTModel;
                flux?: {
                    eotThreshold?: number;
                    eagerEotThreshold?: number;
                    eotTimeoutMs?: number;
                };
            };
        } = {
            stt: {
                provider: sttProviderValue,
                model: sttModelValue,
            },
        };

        if (sttModelValue === 'flux') {
            const flux: { eotThreshold?: number; eagerEotThreshold?: number; eotTimeoutMs?: number } = {};
            const eotThreshold = fluxEotThresholdValue.trim();
            const eagerEotThreshold = fluxEagerEotThresholdValue.trim();
            const eotTimeoutMs = fluxEotTimeoutMsValue.trim();

            if (eotThreshold) {
                const parsed = Number(eotThreshold);
                if (Number.isNaN(parsed) || parsed < 0 || parsed > 1) {
                    toast.error('Flux EOT threshold must be between 0 and 1');
                    return;
                }
                flux.eotThreshold = parsed;
            }

            if (eagerEotThreshold) {
                const parsed = Number(eagerEotThreshold);
                if (Number.isNaN(parsed) || parsed < 0 || parsed > 1) {
                    toast.error('Flux eager EOT threshold must be between 0 and 1');
                    return;
                }
                flux.eagerEotThreshold = parsed;
            }

            if (eotTimeoutMs) {
                const parsed = Number(eotTimeoutMs);
                if (!Number.isInteger(parsed) || parsed <= 0) {
                    toast.error('Flux EOT timeout must be a positive integer');
                    return;
                }
                flux.eotTimeoutMs = parsed;
            }

            updates.stt.flux = flux;
        }

        savingStt = true;
        const response = await updateVoiceSettings(updates);
        if (!response.success) {
            toast.error('Failed to save speech-to-text settings');
            savingStt = false;
            return;
        }

        if (sttProviderValue === 'deepgram' && deepgramApiKeyValue.trim()) {
            const envResponse = await updateEnvVars({
                DEEPGRAM_API_KEY: deepgramApiKeyValue.trim(),
            });
            if (!envResponse.success) {
                toast.error('Speech-to-text saved, but failed to save DEEPGRAM_API_KEY');
                savingStt = false;
                return;
            }
            deepgramApiKeyIsSet = true;
        }

        toast.success('Speech-to-text settings saved. Restart to apply.');
        deepgramApiKeyValue = '';
        if (canCollapse) expanded = false;
        onSaved?.();
        savingStt = false;
    }
</script>

<div
    class="rounded-xl border border-border/50 bg-linear-to-br from-card/80 to-card/40 overflow-hidden opacity-0 animate-[floatUp_0.4s_ease-out_forwards]"
    style="animation-delay: 180ms"
>
    <div class="p-4 border-b border-border/30">
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-linear-to-br from-cyan-500/20 to-cyan-500/5 border border-cyan-500/30 dark:border-cyan-500/20">
                    <Mic class="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div>
                    <h2 class="font-medium text-foreground">Speech-to-Text</h2>
                    <p class="text-xs text-muted-foreground">Configure STT model and Flux endpointing behavior</p>
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
                    <Button onclick={handleSaveStt} disabled={savingStt} class="gap-2">
                        {#if savingStt}
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
            <p class="text-sm text-muted-foreground">Loading voice settings...</p>
        {:else}
        <div class="space-y-3">
            <p class="text-sm text-muted-foreground">
                Contained mode is read-only in the dashboard. Configure speech-to-text via environment variables.
            </p>
            <div class="rounded-md border border-border/50 bg-background/40 p-3 space-y-2">
                <p class="text-xs font-medium text-foreground">Current settings</p>
                <p class="text-xs text-muted-foreground">
                    Provider:
                    <span class="text-foreground font-medium">{sttProviderValue || 'Not set'}</span>
                </p>
                <p class="text-xs text-muted-foreground">
                    Model:
                    <span class="text-foreground font-medium">{sttModelValue || 'Not set'}</span>
                </p>
                <p class="text-xs text-muted-foreground">
                    Flux EOT Threshold:
                    <span class="text-foreground font-medium">{fluxEotThresholdValue || 'Not set'}</span>
                </p>
                <p class="text-xs text-muted-foreground">
                    Flux Eager EOT Threshold:
                    <span class="text-foreground font-medium">{fluxEagerEotThresholdValue || 'Not set'}</span>
                </p>
                <p class="text-xs text-muted-foreground">
                    Flux EOT Timeout (ms):
                    <span class="text-foreground font-medium">{fluxEotTimeoutMsValue || 'Not set'}</span>
                </p>
                <p class="text-xs text-muted-foreground">
                    DEEPGRAM_API_KEY:
                    <span class="text-foreground font-medium">{deepgramApiKeyIsSet ? 'Set' : 'Not set'}</span>
                </p>
            </div>
            <div class="rounded-md border border-border/50 bg-background/40 p-3 space-y-1">
                <p class="text-xs font-medium text-foreground">Config via CLI</p>
                <code class="block text-xs font-mono">nero config set voice.stt.provider deepgram</code>
                <code class="block text-xs font-mono">nero config set voice.stt.model flux</code>
                <code class="block text-xs font-mono">nero config set voice.stt.flux.eotThreshold 0.7</code>
                <code class="block text-xs font-mono">nero config set voice.stt.flux.eagerEotThreshold 0.5</code>
                <code class="block text-xs font-mono">nero config set voice.stt.flux.eotTimeoutMs 3000</code>
            </div>
            <div class="rounded-md border border-border/50 bg-background/40 p-3 space-y-1">
                <p class="text-xs font-medium text-foreground">Secrets</p>
                <code class="block text-xs font-mono">DEEPGRAM_API_KEY=&lt;key&gt;</code>
                <p class="text-xs text-muted-foreground">Set `DEEPGRAM_API_KEY` for Deepgram STT.</p>
            </div>
            <div class="rounded-md border border-border/50 bg-background/40 p-3 space-y-1">
                <p class="text-xs font-medium text-foreground">Apply</p>
                <code class="block text-xs font-mono">restart the container</code>
            </div>
        </div>
        {/if}
        {:else if loading}
            <p class="text-sm text-muted-foreground">Loading voice settings...</p>
        {:else}
        <div>
            <label for="stt-provider" class="mb-1.5 block text-sm font-medium text-foreground">STT Provider</label>
            <select
                id="stt-provider"
                class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                bind:value={sttProviderValue}
                disabled
            >
                <option value="deepgram">Deepgram</option>
            </select>
        </div>

        <div>
            <label for="stt-model" class="mb-1.5 block text-sm font-medium text-foreground">STT Model</label>
            <select
                id="stt-model"
                class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                bind:value={sttModelValue}
            >
                <option value="flux">Flux</option>
                <option value="nova-3">Nova-3</option>
            </select>
        </div>

        {#if sttModelValue === 'flux'}
            <div class="grid gap-4 sm:grid-cols-3">
                <div>
                    <label for="flux-eot-threshold" class="mb-1.5 block text-sm font-medium text-foreground">EOT Threshold</label>
                    <Input
                        id="flux-eot-threshold"
                        type="number"
                        step="0.01"
                        min={0}
                        max={1}
                        bind:value={fluxEotThresholdValue}
                        placeholder="0.7"
                        class="bg-muted/50 border-border/50 focus:border-primary/50"
                    />
                </div>
                <div>
                    <label for="flux-eager-eot-threshold" class="mb-1.5 block text-sm font-medium text-foreground">Eager EOT Threshold</label>
                    <Input
                        id="flux-eager-eot-threshold"
                        type="number"
                        step="0.01"
                        min={0}
                        max={1}
                        bind:value={fluxEagerEotThresholdValue}
                        placeholder="optional"
                        class="bg-muted/50 border-border/50 focus:border-primary/50"
                    />
                </div>
                <div>
                    <label for="flux-eot-timeout" class="mb-1.5 block text-sm font-medium text-foreground">EOT Timeout (ms)</label>
                    <Input
                        id="flux-eot-timeout"
                        type="number"
                        min={1}
                        bind:value={fluxEotTimeoutMsValue}
                        placeholder="3000"
                        class="bg-muted/50 border-border/50 focus:border-primary/50"
                    />
                </div>
            </div>
        {/if}

        {#if sttProviderValue === 'deepgram'}
            <div>
                <div class="mb-1.5 flex items-center gap-2">
                    <label for="deepgram-api-key" class="block text-sm font-medium text-foreground">DEEPGRAM_API_KEY</label>
                    {#if deepgramApiKeyIsSet}
                        <span class="rounded-full bg-green-500/20 border border-green-500/40 dark:border-green-500/30 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400 uppercase tracking-wide flex items-center gap-1">
                            <Check class="h-3 w-3" />
                            Set
                        </span>
                    {/if}
                </div>
                <Input
                    id="deepgram-api-key"
                    type="password"
                    name="voice-deepgram-api-key"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                    spellcheck={false}
                    bind:value={deepgramApiKeyValue}
                    placeholder={deepgramApiKeyIsSet ? '••••••••  (leave blank to keep current)' : 'Required for Deepgram'}
                    class="font-mono text-sm bg-muted/50 border-border/50 focus:border-primary/50"
                />
                <p class="mt-1.5 text-xs text-muted-foreground">
                    Required for Deepgram speech-to-text.
                </p>
            </div>
        {/if}
        {/if}
    </div>
    {:else}
    <div class="p-4">
        <p class="text-sm text-muted-foreground">
            Provider: <span class="text-foreground font-medium">{sttProviderValue}</span>
            · Model: <span class="text-foreground font-medium">{sttModelValue}</span>
            · API key set
        </p>
    </div>
    {/if}
</div>
