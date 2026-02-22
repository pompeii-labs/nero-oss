<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { toast } from 'svelte-sonner';
    import { Button } from '$lib/components/ui/button';
    import ModelConfig from '$lib/components/settings/model-config.svelte';
    import VoiceSttConfig from '$lib/components/settings/voice-stt-config.svelte';
    import VoiceTtsConfig from '$lib/components/settings/voice-tts-config.svelte';
    import { getVoiceSettings } from '$lib/actions/settings';
    import { getEnvVars, getServerInfo, restartService } from '$lib/actions/health';
    import Check from '@lucide/svelte/icons/check';
    import ChevronLeft from '@lucide/svelte/icons/chevron-left';
    import ChevronRight from '@lucide/svelte/icons/chevron-right';
    import Copy from '@lucide/svelte/icons/copy';
    import Loader2 from '@lucide/svelte/icons/loader-2';
    import Rocket from '@lucide/svelte/icons/rocket';

    type StepId = 'llm' | 'voice' | 'restart';

    const steps: Array<{ id: StepId; title: string; subtitle: string }> = [
        {
            id: 'llm',
            title: 'LLM Config',
            subtitle: 'Choose model and set OPENROUTER_API_KEY',
        },
        {
            id: 'voice',
            title: 'Voice Setup',
            subtitle: 'Configure STT/TTS providers and API keys',
        },
        {
            id: 'restart',
            title: 'Restart',
            subtitle: 'Restart Nero to apply your configuration',
        },
        // {
        //     id: 'remote',
        //     title: 'Remote Access',
        //     subtitle: 'OAuth + license flow (placeholder)',
        // },
        // {
        //     id: 'mcp',
        //     title: 'MCPs',
        //     subtitle: 'Add Model Context Protocol servers',
        // },
        // {
        //     id: 'skills',
        //     title: 'Skills',
        //     subtitle: 'Skills onboarding (placeholder)',
        // },
    ];

    let loading = $state(true);
    let restarting = $state(false);
    let currentStepIndex = $state(0);
    let completed = $state(new Set<StepId>());

    let mode: 'integrated' | 'contained' | 'native' = $state('native');
    let sttConfigured = $state(false);
    let ttsConfigured = $state(false);
    const manualRestartCommand = 'nero restart';
    const quickstartProgressKey = 'nero.quickstart.progress';

    const currentStep = $derived(steps[currentStepIndex]);
    const isFirstStep = $derived(currentStepIndex === 0);
    const isLastStep = $derived(currentStepIndex === steps.length - 1);
    const progressPercent = $derived(((currentStepIndex + 1) / steps.length) * 100);
    const isLlmNextDisabled = $derived(currentStep.id === 'llm' && !completed.has('llm'));
    const isVoiceFullyConfigured = $derived(sttConfigured && ttsConfigured);
    const nextLabel = $derived(
        currentStep.id === 'voice' && !isVoiceFullyConfigured ? 'Skip' : 'Next',
    );

    async function copyToClipboard(text: string) {
        await navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard');
    }

    function setQuickstartProgress(value: 'restart_pending' | 'restart_done') {
        sessionStorage.setItem(quickstartProgressKey, value);
    }

    function clearQuickstartProgress() {
        sessionStorage.removeItem(quickstartProgressKey);
    }

    async function waitForServiceAndReload(): Promise<boolean> {
        // Give the service a moment to terminate before polling.
        await new Promise(resolve => setTimeout(resolve, 2500));

        const timeoutMs = 120000;
        const intervalMs = 1500;
        const start = Date.now();

        while (Date.now() - start < timeoutMs) {
            try {
                const response = await fetch('/api', { cache: 'no-store' });
                if (response.ok) {
                    setQuickstartProgress('restart_done');
                    window.location.reload();
                    return true;
                }
            } catch {
                // Service is still restarting.
            }

            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }

        return false;
    }

    onMount(async () => {
        await loadInitialData();
    });

    async function loadInitialData() {
        loading = true;

        const [envRes, serverRes, voiceRes] = await Promise.all([
            getEnvVars(),
            getServerInfo(),
            getVoiceSettings(),
        ]);

        if (envRes.success) {
            const env = envRes.data.env;
            if (env.OPENROUTER_API_KEY?.isSet) {
                completed = new Set([...completed, 'llm']);
            }

            if (voiceRes.success) {
                const voice = voiceRes.data.voice;
                const sttProvider = voice.stt?.provider;
                const sttModel = voice.stt?.model;
                const ttsProvider = voice.tts?.provider;

                sttConfigured =
                    !!sttProvider &&
                    !!sttModel &&
                    (sttProvider === 'deepgram' ? !!env.DEEPGRAM_API_KEY?.isSet : false);
                ttsConfigured =
                    !!ttsProvider &&
                    (ttsProvider === 'elevenlabs'
                        ? !!env.ELEVENLABS_API_KEY?.isSet
                        : !!env.HUME_API_KEY?.isSet);

                if (sttConfigured && ttsConfigured) {
                    completed = new Set([...completed, 'voice']);
                }
            }

        }

        if (serverRes.success) {
            mode = serverRes.data.mode || 'native';
        }

        const savedProgress = sessionStorage.getItem(quickstartProgressKey);
        if (savedProgress === 'restart_pending' || savedProgress === 'restart_done') {
            currentStepIndex = steps.findIndex((s) => s.id === 'restart');
        }
        if (savedProgress === 'restart_done') {
            markComplete('restart');
        }

        loading = false;
    }

    function nextStep() {
        if (currentStepIndex < steps.length - 1) {
            const nextIndex = currentStepIndex + 1;
            currentStepIndex = nextIndex;
            if (steps[nextIndex]?.id === 'restart') {
                setQuickstartProgress('restart_pending');
            }
        }
    }

    function previousStep() {
        if (currentStepIndex > 0) {
            currentStepIndex -= 1;
        }
    }

    function markComplete(step: StepId) {
        completed = new Set([...completed, step]);
    }

    async function refreshVoiceCompletion() {
        const [envRes, voiceRes] = await Promise.all([getEnvVars(), getVoiceSettings()]);
        if (!envRes.success || !voiceRes.success) return;

        const env = envRes.data.env;
        const voice = voiceRes.data.voice;
        const sttProvider = voice.stt?.provider;
        const sttModel = voice.stt?.model;
        const ttsProvider = voice.tts?.provider;

        sttConfigured =
            !!sttProvider &&
            !!sttModel &&
            (sttProvider === 'deepgram' ? !!env.DEEPGRAM_API_KEY?.isSet : false);
        ttsConfigured =
            !!ttsProvider &&
            (ttsProvider === 'elevenlabs'
                ? !!env.ELEVENLABS_API_KEY?.isSet
                : !!env.HUME_API_KEY?.isSet);

        if (sttConfigured && ttsConfigured) {
            markComplete('voice');
        }
    }

    async function restartForChanges() {
        if (mode === 'contained') {
            toast.info(`Contained mode: run ${manualRestartCommand}`);
            markComplete('restart');
            setQuickstartProgress('restart_done');
            return;
        }

        restarting = true;
        setQuickstartProgress('restart_pending');
        const result = await restartService();
        if (!result.success) {
            toast.error('Failed to restart service');
            restarting = false;
            return;
        }
        toast.success('Restarting Nero... waiting for service to come back.');
        const reloaded = await waitForServiceAndReload();
        if (!reloaded) {
            toast.error('Service is taking longer than expected. Refresh manually in a moment.');
            restarting = false;
        }
    }
</script>

<div class="flex h-full flex-col">
    <div class="border-b border-border/50 bg-card/30 backdrop-blur-sm p-6">
        <div class="mx-auto max-w-4xl">
            <div class="flex items-center justify-between gap-4">
                <div>
                    <h1 class="text-2xl font-semibold tracking-tight font-display">
                        <span class="text-gradient-nero">Quickstart</span>
                    </h1>
                    <p class="text-sm text-muted-foreground mt-1">
                        Complete the core setup in a guided flow.
                    </p>
                </div>
                <div class="text-right">
                    <p class="text-xs text-muted-foreground">Step {currentStepIndex + 1} of {steps.length}</p>
                    <p class="text-sm font-medium">{currentStep.title}</p>
                </div>
            </div>

            <div class="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted/50">
                <div
                    class="h-full bg-primary transition-all duration-300"
                    style={`width: ${progressPercent}%`}
                ></div>
            </div>
        </div>
    </div>

    <div class="flex-1 overflow-y-auto">
        <div class="mx-auto max-w-4xl p-6">
            {#if loading}
                <div class="flex flex-col items-center justify-center py-20">
                    <Loader2 class="h-8 w-8 animate-spin text-primary" />
                    <p class="mt-4 text-sm text-muted-foreground">Loading quickstart...</p>
                </div>
            {:else}
                <div class="rounded-xl border border-border/50 bg-card/60 p-6">
                    <div class="mb-6">
                        <h2 class="text-xl font-semibold">{currentStep.title}</h2>
                        <p class="text-sm text-muted-foreground mt-1">{currentStep.subtitle}</p>
                    </div>

                    {#if currentStep.id === 'llm'}
                        <ModelConfig isContainedMode={mode === 'contained'} onSaved={() => markComplete('llm')} />
                    {/if}

                    {#if currentStep.id === 'voice'}
                        <div class="space-y-4">
                            <VoiceTtsConfig isContainedMode={mode === 'contained'} onSaved={refreshVoiceCompletion} />
                            <VoiceSttConfig isContainedMode={mode === 'contained'} onSaved={refreshVoiceCompletion} />
                        </div>
                    {/if}

                    {#if currentStep.id === 'restart'}
                        <div class="space-y-4">
                            <p class="text-sm text-muted-foreground">Restart to apply your LLM and voice settings.</p>
                            {#if mode === 'contained'}
                                <div class="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1 w-fit">
                                    <code class="font-mono text-xs">{manualRestartCommand}</code>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        class="h-7 w-7"
                                        onclick={() => copyToClipboard(manualRestartCommand)}
                                    >
                                        <Copy class="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                                <Button
                                    variant="outline"
                                    onclick={() => {
                                        setQuickstartProgress('restart_done');
                                        markComplete('restart');
                                    }}
                                >
                                    I ran restart
                                </Button>
                            {:else}
                                <Button variant="outline" onclick={restartForChanges} disabled={restarting} class="gap-2">
                                    {#if restarting}
                                        <Loader2 class="h-4 w-4 animate-spin" />
                                        Restarting...
                                    {:else}
                                        Restart service
                                    {/if}
                                </Button>
                            {/if}
                        </div>
                    {/if}
                </div>

                <div class="mt-4 flex items-center justify-between rounded-xl border border-border/50 bg-card/40 p-4">
                    <div class="flex items-center gap-2 text-sm text-muted-foreground">
                        {#if completed.has(currentStep.id)}
                            <Check class="h-4 w-4 text-green-500" />
                            <span>Step completed</span>
                        {:else}
                            <span>Complete this step or continue.</span>
                        {/if}
                    </div>
                    <div class="flex items-center gap-2">
                        <Button variant="outline" onclick={previousStep} disabled={isFirstStep}>
                            <ChevronLeft class="mr-1 h-4 w-4" />
                            Back
                        </Button>
                        {#if isLastStep}
                            <Button
                                onclick={() => {
                                    clearQuickstartProgress();
                                    goto('/');
                                }}
                                class="gap-2"
                                disabled={!completed.has('restart')}
                            >
                                <Rocket class="h-4 w-4" />
                                Start using Nero
                            </Button>
                        {:else}
                            <Button
                                onclick={nextStep}
                                disabled={isLlmNextDisabled}
                                variant={currentStep.id === 'voice' && !isVoiceFullyConfigured ? 'outline' : 'default'}
                            >
                                {nextLabel}
                                <ChevronRight class="ml-1 h-4 w-4" />
                            </Button>
                        {/if}
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div>
