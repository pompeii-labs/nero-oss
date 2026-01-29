<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import NeroIcon from '$lib/components/icons/nero-icon.svelte';

    type Props = {
        text?: string;
    };

    let { text = 'Processing' }: Props = $props();

    const GLITCH_CHARS = '░▒▓█▀▄▌▐◤◥◢◣⌐¬≡≢∷∴∵⋮⋯⋰⋱';

    let glitchedText = $state('');
    let glitchInterval: ReturnType<typeof setInterval> | null = null;

    function getRandomGlitchChar(): string {
        return GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
    }

    function glitchText(original: string): string {
        const chars = original.split('');
        const numGlitches = Math.random() > 0.5 ? 2 : 1;
        for (let i = 0; i < numGlitches; i++) {
            const glitchIndex = Math.floor(Math.random() * chars.length);
            chars[glitchIndex] = getRandomGlitchChar();
        }
        return chars.join('');
    }

    $effect(() => {
        glitchedText = text;
    });

    onMount(() => {
        glitchInterval = setInterval(() => {
            if (Math.random() > 0.6) {
                glitchedText = glitchText(text);
                setTimeout(() => {
                    glitchedText = text;
                }, 30 + Math.random() * 80);
            }
        }, 80);
    });

    onDestroy(() => {
        if (glitchInterval) {
            clearInterval(glitchInterval);
        }
    });
</script>

<div class="flex items-end gap-4">
    <div class="relative flex h-10 w-10 shrink-0 items-center justify-center group">
        <div class="absolute inset-0 rounded-full bg-gradient-to-br from-muted to-background border border-primary/20"></div>
        <div class="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse"></div>
        <div class="absolute inset-[-4px] rounded-full border border-primary/20 animate-arc-pulse"></div>
        <NeroIcon class="relative h-5 w-4 text-primary nero-glow animate-pulse z-10" />
    </div>

    <div class="glass-panel rounded-2xl rounded-bl-md px-5 py-3">
        <div class="flex items-center gap-3">
            <div class="flex items-center gap-1">
                <span class="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" style="animation-delay: 0ms;"></span>
                <span class="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" style="animation-delay: 150ms;"></span>
                <span class="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" style="animation-delay: 300ms;"></span>
            </div>
            <span class="font-mono text-sm text-primary/80">
                {glitchedText}<span class="inline-block w-[2px] h-[14px] bg-primary/60 ml-0.5 align-middle animate-[typing-cursor_1s_infinite]"></span>
            </span>
        </div>
    </div>
</div>
