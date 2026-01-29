<script lang="ts">
    import { onMount } from 'svelte';
    import { voice } from '$lib/stores/voice';
    import { cn } from '$lib/utils';
    import NeroIcon from '$lib/components/icons/nero-icon.svelte';
    import ToolActivityComponent from '$lib/components/chat/tool-activity.svelte';
    import { getServerInfo, type ServerInfo } from '$lib/actions/health';
    import { Button } from '$lib/components/ui/button';
    import { toast } from 'svelte-sonner';
    import Mic from '@lucide/svelte/icons/mic';
    import MicOff from '@lucide/svelte/icons/mic-off';
    import Phone from '@lucide/svelte/icons/phone';
    import PhoneOff from '@lucide/svelte/icons/phone-off';
    import Loader2 from '@lucide/svelte/icons/loader-2';
    import Copy from '@lucide/svelte/icons/copy';
    import Key from '@lucide/svelte/icons/key';

    const {
        status,
        isMuted,
        isTalking,
        rmsLevel,
        transcript,
        activities,
        errorMessage,
        connect,
        disconnect,
        toggleMute
    } = voice;

    let serverInfo: ServerInfo | null = $state(null);
    let loading = $state(true);

    onMount(async () => {
        const response = await getServerInfo();
        if (response.success) {
            serverInfo = response.data;
        }
        loading = false;
    });

    function handleToggleConnection() {
        if ($status === 'connected' || $status === 'connecting') {
            disconnect();
        } else {
            connect();
        }
    }

    async function copyToClipboard(text: string) {
        await navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard');
    }

    const ringScale = $derived(1 + Math.min($rmsLevel * 8, 0.5));
    const recentActivities = $derived($activities.slice(-3));
    const isVoiceEnabled = $derived(serverInfo?.features.voice ?? false);
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
                <h1 class="text-2xl font-semibold tracking-tight">
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
    <div class="flex h-full flex-col items-center justify-center relative overflow-hidden">
        <div class="absolute inset-0 pointer-events-none">
            <div class="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
            <div class="absolute bottom-1/3 right-1/4 w-64 h-64 bg-[hsl(var(--nero-cyan))]/3 rounded-full blur-3xl"></div>
        </div>

        <div class="flex-1 flex flex-col items-center justify-center gap-8 relative z-10">
            <div class="relative">
                {#if $status === 'connected'}
                    <div
                        class="absolute inset-[-30px] rounded-full border-2 border-primary/30 transition-transform duration-75"
                        style="transform: scale({ringScale})"
                    ></div>
                    <div
                        class="absolute inset-[-50px] rounded-full border border-primary/20 transition-transform duration-100"
                        style="transform: scale({1 + ringScale * 0.3})"
                    ></div>
                    <div
                        class="absolute inset-[-70px] rounded-full border border-primary/10 transition-transform duration-150"
                        style="transform: scale({1 + ringScale * 0.15})"
                    ></div>
                {/if}

                {#if $isTalking}
                    <div class="absolute inset-[-20px] rounded-full bg-primary/20 blur-xl animate-pulse"></div>
                {/if}

                <button
                    type="button"
                    onclick={handleToggleConnection}
                    disabled={$status === 'connecting'}
                    class={cn(
                        'relative flex h-32 w-32 items-center justify-center rounded-full transition-all',
                        $status === 'connected'
                            ? 'bg-gradient-to-br from-primary to-primary/80 nero-glow-strong'
                            : 'glass-panel hover:border-primary/40',
                        $status === 'connecting' && 'opacity-70'
                    )}
                >
                    {#if $status === 'connecting'}
                        <Loader2 class="h-12 w-12 text-primary animate-spin" />
                    {:else if $status === 'connected'}
                        <NeroIcon class="h-16 w-12 text-primary-foreground" />
                    {:else}
                        <Phone class="h-10 w-10 text-primary" />
                    {/if}
                </button>
            </div>

            <div class="text-center space-y-2">
                {#if $status === 'idle'}
                    <h2 class="text-2xl font-semibold text-foreground">Voice Mode</h2>
                    <p class="text-muted-foreground">Tap to start talking with Nero</p>
                {:else if $status === 'connecting'}
                    <h2 class="text-2xl font-semibold text-foreground">Connecting...</h2>
                    <p class="text-muted-foreground">Setting up voice connection</p>
                {:else if $status === 'connected'}
                    <h2 class="text-2xl font-semibold text-gradient-nero">
                        {$isTalking ? 'Nero is speaking' : $isMuted ? 'Muted' : 'Listening'}
                    </h2>
                    {#if $transcript}
                        <p class="text-muted-foreground max-w-md">{$transcript}</p>
                    {:else}
                        <p class="text-muted-foreground">Say something to Nero</p>
                    {/if}
                {:else if $status === 'error'}
                    <h2 class="text-2xl font-semibold text-red-400">Connection Error</h2>
                    <p class="text-muted-foreground">{$errorMessage || 'Something went wrong'}</p>
                {/if}
            </div>

            {#if $status === 'connected'}
                <div class="flex items-center gap-4">
                    <button
                        type="button"
                        onclick={toggleMute}
                        class={cn(
                            'flex h-14 w-14 items-center justify-center rounded-full transition-all',
                            $isMuted
                                ? 'bg-red-500/20 border border-red-500/40 text-red-400'
                                : 'glass-panel text-primary hover:border-primary/40'
                        )}
                    >
                        {#if $isMuted}
                            <MicOff class="h-6 w-6" />
                        {:else}
                            <Mic class="h-6 w-6" />
                        {/if}
                    </button>

                    <button
                        type="button"
                        onclick={disconnect}
                        class="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20 border border-red-500/40 text-red-400 transition-all hover:bg-red-500/30"
                    >
                        <PhoneOff class="h-6 w-6" />
                    </button>
                </div>
            {/if}
        </div>

        {#if recentActivities.length > 0}
            <div class="w-full max-w-lg px-4 pb-6 space-y-2 relative z-20">
                {#each recentActivities as activity (activity.tool + activity.status)}
                    <div class="animate-[floatUp_0.3s_ease-out]">
                        <ToolActivityComponent {activity} />
                    </div>
                {/each}
            </div>
        {/if}
    </div>
{/if}
