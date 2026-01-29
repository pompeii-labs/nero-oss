<script lang="ts">
    import { voice } from '$lib/stores/voice';
    import { cn } from '$lib/utils';
    import NeroIcon from '$lib/components/icons/nero-icon.svelte';
    import ToolActivityComponent from '$lib/components/chat/tool-activity.svelte';
    import Mic from '@lucide/svelte/icons/mic';
    import MicOff from '@lucide/svelte/icons/mic-off';
    import Phone from '@lucide/svelte/icons/phone';
    import PhoneOff from '@lucide/svelte/icons/phone-off';
    import Loader2 from '@lucide/svelte/icons/loader-2';

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

    function handleToggleConnection() {
        if ($status === 'connected' || $status === 'connecting') {
            disconnect();
        } else {
            connect();
        }
    }

    const ringScale = $derived(1 + Math.min($rmsLevel * 8, 0.5));
    const recentActivities = $derived($activities.slice(-3));
</script>

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
