<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { voice } from '$lib/stores/voice.svelte';
    import { graph } from '$lib/stores/graph.svelte';
    import { cn } from '$lib/utils';
    import NeroSphere from '$lib/components/nero-sphere.svelte';
    import { getServerInfo, type ServerInfo } from '$lib/actions/health';
    import { Button } from '$lib/components/ui/button';
    import { toast } from 'svelte-sonner';
    import Mic from '@lucide/svelte/icons/mic';
    import MicOff from '@lucide/svelte/icons/mic-off';
    import PhoneOff from '@lucide/svelte/icons/phone-off';
    import Loader2 from '@lucide/svelte/icons/loader-2';
    import Copy from '@lucide/svelte/icons/copy';
    import Key from '@lucide/svelte/icons/key';

    let serverInfo = $state<ServerInfo | null>(null);
    let loading = $state(true);

    onMount(async () => {
        graph.startPolling();
        const response = await getServerInfo();
        if (response.success) {
            serverInfo = response.data;
        }
        loading = false;
    });

    onDestroy(() => {
        graph.stopPolling();
    });

    function handleToggleConnection() {
        if (voice.status === 'connected' || voice.status === 'connecting') {
            voice.disconnect();
        } else {
            voice.connect();
        }
    }

    async function copyToClipboard(text: string) {
        await navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard');
    }

    const isVoiceEnabled = $derived(serverInfo?.features.voice ?? false);

    let seenActivityTools = new Set<string>();

    $effect(() => {
        const acts = voice.activities;
        for (const a of acts) {
            const key = `${a.tool}-${a.id}`;
            if (a.status === 'running' && !seenActivityTools.has(key)) {
                seenActivityTools.add(key);
                graph.fireToolName(a.tool);
            }
        }
        if (acts.length === 0) seenActivityTools = new Set();
    });
</script>

{#if loading}
    <div class="flex h-full flex-col items-center justify-center">
        <div class="relative">
            <div class="absolute inset-0 blur-2xl bg-primary/20 rounded-full"></div>
            <Loader2 class="relative h-8 w-8 animate-spin text-primary" />
        </div>
        <p class="mt-4 text-sm text-muted-foreground">Loading...</p>
    </div>
{:else if !isVoiceEnabled}
    <div class="flex h-full flex-col">
        <div class="border-b border-border/50 bg-card/30 backdrop-blur-sm p-6">
            <div class="mx-auto max-w-4xl">
                <h1 class="text-2xl font-semibold tracking-tight font-display">
                    <span class="text-gradient-nero">Voice</span>
                </h1>
                <p class="text-sm text-muted-foreground mt-1">Talk to Nero using voice</p>
            </div>
        </div>

        <div class="flex-1 overflow-y-auto">
            <div class="mx-auto max-w-4xl p-6">
                <div
                    class="rounded-xl border border-border/50 bg-gradient-to-br from-card/80 to-card/40 overflow-hidden opacity-0 animate-[floatUp_0.4s_ease-out_forwards]"
                >
                    <div class="p-4 border-b border-border/30">
                        <div class="flex items-center gap-3">
                            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/20">
                                <Mic class="h-5 w-5 text-amber-400" />
                            </div>
                            <div>
                                <h2 class="font-medium text-foreground">Voice Not Configured</h2>
                                <p class="text-xs text-muted-foreground">Set up voice to talk to Nero</p>
                            </div>
                        </div>
                    </div>
                    <div class="p-4 space-y-4">
                        <p class="text-sm text-muted-foreground">
                            Voice mode requires a Nero license key and API keys for speech services.
                        </p>

                        <div class="rounded-lg bg-muted/30 border border-border/30 p-4 space-y-4">
                            <h3 class="text-sm font-medium text-foreground">Setup Instructions</h3>

                            <div class="space-y-2">
                                <p class="text-sm text-muted-foreground">1. Get a Nero license key from Pompeii Labs</p>
                            </div>

                            <div class="space-y-2">
                                <p class="text-sm text-muted-foreground">2. Set the required environment variables:</p>
                                <div class="space-y-2">
                                    <div class="flex items-center gap-2">
                                        <code class="flex-1 px-3 py-2 rounded-md bg-background border border-border font-mono text-xs text-foreground overflow-x-auto">
                                            NERO_LICENSE_KEY=your_license_key
                                        </code>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            class="h-8 w-8 shrink-0"
                                            onclick={() => copyToClipboard('NERO_LICENSE_KEY=your_license_key')}
                                        >
                                            <Copy class="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <code class="flex-1 px-3 py-2 rounded-md bg-background border border-border font-mono text-xs text-foreground overflow-x-auto">
                                            ELEVENLABS_API_KEY=your_elevenlabs_key
                                        </code>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            class="h-8 w-8 shrink-0"
                                            onclick={() => copyToClipboard('ELEVENLABS_API_KEY=your_elevenlabs_key')}
                                        >
                                            <Copy class="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <code class="flex-1 px-3 py-2 rounded-md bg-background border border-border font-mono text-xs text-foreground overflow-x-auto">
                                            DEEPGRAM_API_KEY=your_deepgram_key
                                        </code>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            class="h-8 w-8 shrink-0"
                                            onclick={() => copyToClipboard('DEEPGRAM_API_KEY=your_deepgram_key')}
                                        >
                                            <Copy class="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <div class="space-y-2">
                                <p class="text-sm text-muted-foreground">3. Enable voice in your config (<code class="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-xs">~/.nero/config.json</code>):</p>
                                <div class="flex items-center gap-2">
                                    <code class="flex-1 px-3 py-2 rounded-md bg-background border border-border font-mono text-xs text-foreground overflow-x-auto whitespace-pre">
{`"voice": { "enabled": true }`}
                                    </code>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        class="h-8 w-8 shrink-0"
                                        onclick={() => copyToClipboard('"voice": { "enabled": true }')}
                                    >
                                        <Copy class="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div class="space-y-2">
                                <p class="text-sm text-muted-foreground">4. Restart the Nero service:</p>
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
                                <span class="font-medium text-primary">Note:</span> ElevenLabs is used for text-to-speech and Deepgram for speech-to-text. Both require separate API keys.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
{:else}
    <div class="relative h-full overflow-hidden">
        <div class="absolute inset-0 pointer-events-none">
            <div class="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
            <div class="absolute bottom-1/3 right-1/4 w-64 h-64 bg-nero-cyan/3 rounded-full blur-3xl"></div>
        </div>

        <div class="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div class="pointer-events-auto w-[300px] h-[300px]">
                <NeroSphere
                    status={voice.status}
                    rmsLevel={voice.rmsLevel}
                    isTalking={voice.isTalking}
                    isProcessing={voice.isProcessing}
                    isMuted={voice.isMuted}
                    outputRms={voice.outputRms}
                    onclick={handleToggleConnection}
                    graphData={graph.graphData}
                    activatedNodeIds={graph.activatedNodeIds}
                    toolFires={graph.toolFires}
                />
            </div>
        </div>

        <div class="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center gap-4 pb-8">
            {#if voice.status === 'idle'}
                <p class="text-sm text-muted-foreground/50">Tap to start talking with Nero</p>
            {:else if voice.status === 'connecting'}
                <p class="text-sm text-muted-foreground">Setting up voice connection...</p>
            {:else if voice.status === 'error'}
                <p class="text-sm text-red-400">{voice.errorMessage || 'Connection failed'}</p>
            {:else if voice.status === 'connected'}
                <p class="text-sm text-muted-foreground/60 max-w-md text-center">
                    {#if voice.transcript}
                        {voice.transcript}
                    {:else}
                        Say something to Nero
                    {/if}
                </p>

                <div class="flex items-center gap-3">
                    <button
                        type="button"
                        onclick={voice.toggleMute}
                        class={cn(
                            'flex h-11 w-11 items-center justify-center rounded-full transition-all',
                            voice.isMuted
                                ? 'bg-red-500/20 border border-red-500/40 text-red-400'
                                : 'glass-panel text-primary hover:border-primary/40'
                        )}
                    >
                        {#if voice.isMuted}
                            <MicOff class="h-5 w-5" />
                        {:else}
                            <Mic class="h-5 w-5" />
                        {/if}
                    </button>

                    <button
                        type="button"
                        onclick={voice.disconnect}
                        class="flex h-11 w-11 items-center justify-center rounded-full bg-red-500/20 border border-red-500/40 text-red-400 transition-all hover:bg-red-500/30"
                    >
                        <PhoneOff class="h-5 w-5" />
                    </button>
                </div>
            {/if}

        </div>
    </div>
{/if}
