<script lang="ts">
    import { onMount } from "svelte";
    import { Button } from "$components/ui/button";
    import { Input } from "$components/ui/input";
    import { getVoiceSettings, updateVoiceSettings } from "$lib/actions/settings";
    import { getEnvVars, updateEnvVars } from "$lib/actions/health";
    import LoaderCircle from "@lucide/svelte/icons/loader-circle";
    import Volume2 from "@lucide/svelte/icons/volume-2";
    import Check from "@lucide/svelte/icons/check";
    import ChevronDown from "@lucide/svelte/icons/chevron-down";
    import ChevronUp from "@lucide/svelte/icons/chevron-up";
    import { toast } from "svelte-sonner";

    let { isContainedMode = false, onSaved }: { isContainedMode?: boolean; onSaved?: () => void } = $props();

    let ttsProviderValue = $state<'elevenlabs' | 'hume'>('elevenlabs');
    let elevenlabsApiKeyValue = $state('');
    let humeApiKeyValue = $state('');
    let elevenlabsApiKeyIsSet = $state(false);
    let humeApiKeyIsSet = $state(false);
    let loading = $state(true);
    let savingTts = $state(false);
    let expanded = $state(true);
    const providerApiKeyIsSet = $derived(
        ttsProviderValue === 'elevenlabs' ? elevenlabsApiKeyIsSet : humeApiKeyIsSet,
    );
    const canCollapse = $derived(Boolean(ttsProviderValue) && providerApiKeyIsSet);

    onMount(async () => {
        const [voiceRes, envRes] = await Promise.all([getVoiceSettings(), getEnvVars()]);

        if (voiceRes.success) {
            ttsProviderValue = voiceRes.data.voice.tts?.provider || 'elevenlabs';
        }

        if (envRes.success) {
            elevenlabsApiKeyIsSet = envRes.data.env.ELEVENLABS_API_KEY?.isSet || false;
            humeApiKeyIsSet = envRes.data.env.HUME_API_KEY?.isSet || false;
            elevenlabsApiKeyValue = '';
            humeApiKeyValue = '';
        }

        expanded = !canCollapse;
        loading = false;
    });

    function toggleExpanded() {
        if (expanded && !canCollapse) {
            toast.info('Set provider and provider API key before collapsing this section.');
            return;
        }
        expanded = !expanded;
    }

    async function handleSaveTts() {
        if (isContainedMode) {
            toast.info('Contained mode: set environment variables in your deployment.');
            return;
        }

        savingTts = true;

        const voiceResponse = await updateVoiceSettings({
            tts: {
                provider: ttsProviderValue,
            },
        });
        if (!voiceResponse.success) {
            toast.error('Failed to save text-to-speech settings');
            savingTts = false;
            return;
        }

        const envToSave: Record<string, string> = {};
        if (elevenlabsApiKeyValue.trim()) {
            envToSave.ELEVENLABS_API_KEY = elevenlabsApiKeyValue.trim();
        }
        if (humeApiKeyValue.trim()) {
            envToSave.HUME_API_KEY = humeApiKeyValue.trim();
        }

        if (Object.keys(envToSave).length > 0) {
            const envResponse = await updateEnvVars(envToSave);
            if (!envResponse.success) {
                toast.error('TTS saved, but failed to save API keys');
                savingTts = false;
                return;
            }
            if (envToSave.ELEVENLABS_API_KEY) elevenlabsApiKeyIsSet = true;
            if (envToSave.HUME_API_KEY) humeApiKeyIsSet = true;
        }

        toast.success('Text-to-speech settings saved. Restart to apply.');
        elevenlabsApiKeyValue = '';
        humeApiKeyValue = '';
        if (canCollapse) expanded = false;
        onSaved?.();
        savingTts = false;
    }
</script>

<div
    class="rounded-xl border border-border/50 bg-linear-to-br from-card/80 to-card/40 overflow-hidden opacity-0 animate-[floatUp_0.4s_ease-out_forwards]"
    style="animation-delay: 160ms"
>
    <div class="p-4 border-b border-border/30">
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-linear-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/30 dark:border-emerald-500/20">
                    <Volume2 class="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                    <h2 class="font-medium text-foreground">Text-to-Speech</h2>
                    <p class="text-xs text-muted-foreground">Configure TTS provider and provider API keys</p>
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
                    <Button onclick={handleSaveTts} disabled={savingTts} class="gap-2">
                        {#if savingTts}
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
                Contained mode is read-only in the dashboard. Configure text-to-speech via environment variables.
            </p>
            <div class="rounded-md border border-border/50 bg-background/40 p-3 space-y-2">
                <p class="text-xs font-medium text-foreground">Current settings</p>
                <p class="text-xs text-muted-foreground">
                    Provider:
                    <span class="text-foreground font-medium">{ttsProviderValue || 'Not set'}</span>
                </p>
                <p class="text-xs text-muted-foreground">
                    ELEVENLABS_API_KEY:
                    <span class="text-foreground font-medium">{elevenlabsApiKeyIsSet ? 'Set' : 'Not set'}</span>
                </p>
                <p class="text-xs text-muted-foreground">
                    HUME_API_KEY:
                    <span class="text-foreground font-medium">{humeApiKeyIsSet ? 'Set' : 'Not set'}</span>
                </p>
            </div>
            <div class="rounded-md border border-border/50 bg-background/40 p-3 space-y-1">
                <p class="text-xs font-medium text-foreground">Config via CLI</p>
                <code class="block text-xs font-mono">nero config set voice.tts.provider elevenlabs</code>
                <code class="block text-xs font-mono">nero config set voice.tts.elevenlabs.voiceId &lt;voice-id&gt;</code>
                <code class="block text-xs font-mono">nero config set voice.tts.provider hume</code>
                <code class="block text-xs font-mono">nero config set voice.tts.hume.voice Kora</code>
            </div>
            <div class="rounded-md border border-border/50 bg-background/40 p-3 space-y-1">
                <p class="text-xs font-medium text-foreground">Secrets</p>
                <code class="block text-xs font-mono">ELEVENLABS_API_KEY=&lt;key&gt;</code>
                <code class="block text-xs font-mono">HUME_API_KEY=&lt;key&gt;</code>
                <p class="text-xs text-muted-foreground">Set the key that matches your provider.</p>
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
            <label for="tts-provider" class="mb-1.5 block text-sm font-medium text-foreground">TTS Provider</label>
            <select
                id="tts-provider"
                class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                bind:value={ttsProviderValue}
            >
                <option value="elevenlabs">ElevenLabs</option>
                <option value="hume">Hume</option>
            </select>
        </div>

        {#if ttsProviderValue === 'elevenlabs'}
            <div>
                <div class="mb-1.5 flex items-center gap-2">
                    <label for="elevenlabs-api-key" class="block text-sm font-medium text-foreground">ELEVENLABS_API_KEY</label>
                    {#if elevenlabsApiKeyIsSet}
                        <span class="rounded-full bg-green-500/20 border border-green-500/40 dark:border-green-500/30 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400 uppercase tracking-wide flex items-center gap-1">
                            <Check class="h-3 w-3" />
                            Set
                        </span>
                    {/if}
                </div>
                <Input
                    id="elevenlabs-api-key"
                    type="password"
                    name="voice-elevenlabs-api-key"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                    spellcheck={false}
                    bind:value={elevenlabsApiKeyValue}
                    placeholder={elevenlabsApiKeyIsSet ? '••••••••  (leave blank to keep current)' : 'Required for ElevenLabs'}
                    class="font-mono text-sm bg-muted/50 border-border/50 focus:border-primary/50"
                />
            </div>
        {:else}
            <div>
                <div class="mb-1.5 flex items-center gap-2">
                    <label for="hume-api-key" class="block text-sm font-medium text-foreground">HUME_API_KEY</label>
                    {#if humeApiKeyIsSet}
                        <span class="rounded-full bg-green-500/20 border border-green-500/40 dark:border-green-500/30 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400 uppercase tracking-wide flex items-center gap-1">
                            <Check class="h-3 w-3" />
                            Set
                        </span>
                    {/if}
                </div>
                <Input
                    id="hume-api-key"
                    type="password"
                    name="voice-hume-api-key"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                    spellcheck={false}
                    bind:value={humeApiKeyValue}
                    placeholder={humeApiKeyIsSet ? '••••••••  (leave blank to keep current)' : 'Required for Hume'}
                    class="font-mono text-sm bg-muted/50 border-border/50 focus:border-primary/50"
                />
            </div>
        {/if}
        {/if}
    </div>
    {:else}
    <div class="p-4">
        <p class="text-sm text-muted-foreground">
            Provider: <span class="text-foreground font-medium">{ttsProviderValue}</span> · API key set
        </p>
    </div>
    {/if}
</div>
