<script lang="ts">
    import { cn } from '$lib/utils';
    import { marked } from 'marked';
    import ChevronRight from '@lucide/svelte/icons/chevron-right';
    import Copy from '@lucide/svelte/icons/copy';
    import Check from '@lucide/svelte/icons/check';
    import NeroIcon from '$lib/components/icons/nero-icon.svelte';
    import Phone from '@lucide/svelte/icons/phone';
    import MessageSquare from '@lucide/svelte/icons/message-square';
    import Terminal from '@lucide/svelte/icons/terminal';
    import Hash from '@lucide/svelte/icons/hash';

    type Props = {
        role: 'user' | 'assistant' | 'system';
        content: string;
        medium?: 'cli' | 'api' | 'voice' | 'sms' | 'slack';
        isStreaming?: boolean;
    };

    let { role, content, medium, isStreaming = false }: Props = $props();
    let copied = $state(false);

    const mediumConfig = {
        voice: { icon: Phone, label: 'Voice', color: 'text-green-600 dark:text-green-400', userColor: 'text-white/70 dark:text-green-400' },
        sms: { icon: MessageSquare, label: 'SMS', color: 'text-blue-600 dark:text-blue-400', userColor: 'text-white/70 dark:text-blue-400' },
        cli: { icon: Terminal, label: 'CLI', color: 'text-amber-600 dark:text-amber-400', userColor: 'text-white/70 dark:text-amber-400' },
        slack: { icon: Hash, label: 'Slack', color: 'text-purple-600 dark:text-purple-400', userColor: 'text-white/70 dark:text-purple-400' },
        api: null
    };

    const showMedium = medium && medium !== 'api' && mediumConfig[medium];

    marked.setOptions({
        breaks: true,
        gfm: true
    });

    const renderedContent = $derived(marked.parse(content) as string);

    async function copyToClipboard() {
        await navigator.clipboard.writeText(content);
        copied = true;
        setTimeout(() => copied = false, 2000);
    }
</script>

{#if role === 'system'}
    <div class="message-appear flex items-start gap-3 group">
        <div class="relative flex h-7 w-7 shrink-0 items-center justify-center">
            <div class="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20"></div>
            <ChevronRight class="relative h-3.5 w-3.5 text-primary/70" />
        </div>
        <div class="flex-1 relative">
            <div class="absolute -left-px top-2 bottom-2 w-px bg-gradient-to-b from-primary/40 via-primary/20 to-transparent"></div>
            <div class="glass-panel rounded-xl px-4 py-3 ml-2">
                <pre class="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-foreground/80">{content}</pre>
            </div>
        </div>
    </div>
{:else if role === 'user'}
    <div class="message-appear-user flex gap-4 flex-row-reverse items-end">
        <div class="relative flex h-9 w-9 shrink-0 items-center justify-center holo-ring">
            <div class="absolute inset-0 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 z-10"></div>
            <div class="absolute inset-[3px] rounded-full bg-background z-10"></div>
            <div class="absolute inset-[6px] rounded-full bg-gradient-to-br from-primary to-primary/80 z-10"></div>
            <svg class="absolute h-3 w-3 text-primary-foreground z-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
            </svg>
        </div>

        <div class="max-w-[75%] relative group">
            <div class="absolute -inset-1 rounded-2xl bg-primary/20 blur-xl opacity-60 group-hover:opacity-80 transition-opacity"></div>
            <div class="relative glass-panel-user rounded-2xl rounded-br-md px-4 py-3">
                {#if showMedium}
                    {@const config = mediumConfig[medium!]!}
                    <div class="flex items-center gap-1.5 mb-1.5 text-xs {config.userColor}">
                        <svelte:component this={config.icon} class="h-3 w-3" />
                        <span>via {config.label}</span>
                    </div>
                {/if}
                <p class="text-[15px] leading-relaxed text-white whitespace-pre-wrap">
                    {content}
                </p>
            </div>
        </div>
    </div>
{:else}
    <div class="message-appear flex gap-4 items-end">
        <div class="relative flex h-10 w-10 shrink-0 items-center justify-center group/icon">
            <div class="absolute inset-0 rounded-full bg-gradient-to-br from-muted to-background border border-primary/20"></div>
            <div class="absolute inset-0 rounded-full bg-primary/10 blur-xl opacity-60 group-hover/icon:opacity-100 transition-opacity"></div>

            <div class="absolute inset-[-4px] rounded-full border border-primary/10 animate-arc-pulse"></div>
            <div class="absolute inset-[-8px] rounded-full border border-primary/5 opacity-50"></div>

            <NeroIcon class="relative h-5 w-4 text-primary nero-glow-subtle z-10" />
        </div>

        <div class="max-w-[75%] relative group/msg">
            <div class="absolute -inset-1 rounded-2xl bg-primary/5 blur-xl opacity-0 group-hover/msg:opacity-60 transition-opacity"></div>
            <div class="relative glass-panel rounded-2xl rounded-bl-md px-4 py-3 arc-border">
                {#if showMedium}
                    {@const config = mediumConfig[medium!]!}
                    <div class="flex items-center gap-1.5 mb-1.5 text-xs {config.color} opacity-80">
                        <svelte:component this={config.icon} class="h-3 w-3" />
                        <span>via {config.label}</span>
                    </div>
                {/if}
                {#if isStreaming}
                    <p class="relative text-[15px] leading-relaxed text-foreground/90 whitespace-pre-wrap">
                        {content}<span class="inline-block w-[2px] h-[18px] bg-primary ml-1 align-middle animate-[typing-cursor_1s_infinite] nero-glow-subtle"></span>
                    </p>
                {:else}
                    <div class="prose prose-sm prose-invert max-w-none text-[15px] leading-relaxed text-foreground/90">
                        {@html renderedContent}
                    </div>
                {/if}
            </div>
            <button
                type="button"
                onclick={copyToClipboard}
                class="absolute -right-2 -top-2 p-1.5 rounded-lg bg-background/80 border border-border/50 opacity-0 group-hover/msg:opacity-100 transition-opacity hover:bg-background hover:border-primary/30"
                title="Copy message"
            >
                {#if copied}
                    <Check class="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                {:else}
                    <Copy class="h-3.5 w-3.5 text-muted-foreground" />
                {/if}
            </button>
        </div>
    </div>
{/if}
