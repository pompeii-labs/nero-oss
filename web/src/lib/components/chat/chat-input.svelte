<script lang="ts">
    import { Textarea } from '$lib/components/ui/textarea';
    import { Button } from '$lib/components/ui/button';
    import CommandPalette from './command-palette.svelte';
    import { getSuggestions, isSlashCommand, type Suggestion } from '$lib/commands';
    import ArrowUp from '@lucide/svelte/icons/arrow-up';
    import Square from '@lucide/svelte/icons/square';

    type Props = {
        onSubmit: (message: string) => void;
        onCommand?: (command: string) => void;
        onAbort?: () => void;
        disabled?: boolean;
        loading?: boolean;
    };

    let { onSubmit, onCommand, onAbort, disabled = false, loading = false }: Props = $props();

    let message = $state('');
    let textareaRef: HTMLTextAreaElement | null = $state(null);
    let containerRef: HTMLDivElement | null = $state(null);
    let suggestions: Suggestion[] = $state([]);
    let selectedIndex = $state(0);
    let isFocused = $state(false);

    const MIN_HEIGHT = 56;
    const MAX_HEIGHT = 200;

    async function updateSuggestions() {
        if (isSlashCommand(message)) {
            const partial = message.slice(1).split(/\s+/)[0] || '';
            if (!message.includes(' ')) {
                suggestions = await getSuggestions(partial);
                selectedIndex = 0;
            } else {
                suggestions = [];
            }
        } else {
            suggestions = [];
        }
    }

    function handleSubmit() {
        if (!message.trim() || disabled || loading) return;

        if (isSlashCommand(message) && onCommand) {
            onCommand(message.trim());
        } else {
            onSubmit(message.trim());
        }
        message = '';
        suggestions = [];
        textareaRef?.focus();
    }

    function handleAbort() {
        if (loading && onAbort) {
            onAbort();
        }
    }

    function selectSuggestion(suggestion: Suggestion) {
        if (suggestion.type === 'command') {
            message = `/${suggestion.command.name} `;
        } else {
            message = `/${suggestion.name} `;
        }
        suggestions = [];
        textareaRef?.focus();
    }

    function handleKeyDown(event: KeyboardEvent) {
        if (loading && onAbort) {
            if (event.key === 'Escape' || (event.key === 'c' && (event.ctrlKey || event.metaKey))) {
                event.preventDefault();
                handleAbort();
                return;
            }
        }

        if (suggestions.length > 0) {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                selectedIndex = (selectedIndex + 1) % suggestions.length;
                return;
            }
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                selectedIndex = (selectedIndex - 1 + suggestions.length) % suggestions.length;
                return;
            }
            if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
                event.preventDefault();
                selectSuggestion(suggestions[selectedIndex]);
                return;
            }
            if (event.key === 'Escape') {
                suggestions = [];
                return;
            }
        }

        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSubmit();
        }
    }

    function handleInput() {
        updateSuggestions();
    }

    $effect(() => {
        message;
        if (!textareaRef || !containerRef) return;

        textareaRef.style.height = 'auto';
        const scrollHeight = textareaRef.scrollHeight;
        const newHeight = Math.min(Math.max(scrollHeight, MIN_HEIGHT), MAX_HEIGHT);
        containerRef.style.height = `${newHeight}px`;
        textareaRef.style.height = '100%';
    });
</script>

<div class="floating-input p-4 pt-6">
    <div class="mx-auto max-w-3xl">
        <div
            bind:this={containerRef}
            class="relative input-glow rounded-2xl {isFocused ? 'ring-1 ring-primary/30' : ''}"
            style="height: {MIN_HEIGHT}px"
        >
            <CommandPalette
                {suggestions}
                {selectedIndex}
                onSelect={selectSuggestion}
            />

            <Textarea
                bind:ref={textareaRef}
                bind:value={message}
                placeholder="Ask Nero anything..."
                class="h-full w-full resize-none bg-transparent border-0 pr-14 pl-4 pt-4 font-mono text-sm placeholder:text-muted-foreground/40 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                onkeydown={handleKeyDown}
                oninput={handleInput}
                onfocus={() => isFocused = true}
                onblur={() => isFocused = false}
                {disabled}
            />

            <div class="absolute bottom-3 right-3">
                {#if loading && onAbort}
                    <button
                        type="button"
                        onclick={handleAbort}
                        class="relative flex h-10 w-10 items-center justify-center rounded-xl bg-muted/80 text-muted-foreground transition-all hover:bg-muted hover:text-foreground group"
                        title="Stop (Esc)"
                    >
                        <Square class="relative h-3.5 w-3.5 fill-current" />
                    </button>
                {:else}
                    <button
                        type="button"
                        onclick={handleSubmit}
                        disabled={!message.trim() || disabled || loading}
                        class="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground transition-all hover:from-primary/90 hover:to-primary/70 disabled:opacity-40 disabled:cursor-not-allowed group"
                    >
                        <div class="absolute inset-0 rounded-xl bg-primary/30 blur-lg opacity-0 group-hover:opacity-60 transition-opacity"></div>
                        <ArrowUp class="relative h-4 w-4" />
                    </button>
                {/if}
            </div>
        </div>

        <div class="mt-3 flex items-center justify-center gap-4 text-[11px] text-muted-foreground/50">
            <span class="flex items-center gap-1.5">
                <kbd class="px-1.5 py-0.5 rounded bg-muted/30 border border-border/50 font-mono text-[10px]">Enter</kbd>
                <span>to send</span>
            </span>
            <span class="flex items-center gap-1.5">
                <kbd class="px-1.5 py-0.5 rounded bg-muted/30 border border-border/50 font-mono text-[10px]">/</kbd>
                <span>for commands</span>
            </span>
            {#if loading && onAbort}
                <span class="flex items-center gap-1.5">
                    <kbd class="px-1.5 py-0.5 rounded bg-muted/30 border border-border/50 font-mono text-[10px]">Esc</kbd>
                    <span>to stop</span>
                </span>
            {/if}
        </div>
    </div>
</div>
