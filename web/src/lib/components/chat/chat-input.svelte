<script lang="ts">
    import { Textarea } from '$lib/components/ui/textarea';
    import { Button } from '$lib/components/ui/button';
    import CommandPalette from './command-palette.svelte';
    import { getSuggestions, isSlashCommand, type Suggestion } from '$lib/commands';
    import ArrowUp from '@lucide/svelte/icons/arrow-up';
    import Square from '@lucide/svelte/icons/square';
    import Paperclip from '@lucide/svelte/icons/paperclip';
    import X from '@lucide/svelte/icons/x';
    import FileText from '@lucide/svelte/icons/file-text';

    export type PendingFile = {
        file: File;
        preview?: string;
        id: string;
    };

    type Props = {
        onSubmit: (message: string, files?: PendingFile[]) => void;
        onCommand?: (command: string) => void;
        onAbort?: () => void;
        disabled?: boolean;
        loading?: boolean;
    };

    let { onSubmit, onCommand, onAbort, disabled = false, loading = false }: Props = $props();

    let message = $state('');
    let textareaRef: HTMLTextAreaElement | null = $state(null);
    let containerRef: HTMLDivElement | null = $state(null);
    let fileInputRef: HTMLInputElement | null = $state(null);
    let suggestions: Suggestion[] = $state([]);
    let selectedIndex = $state(0);
    let isFocused = $state(false);
    let isDragOver = $state(false);
    let pendingFiles: PendingFile[] = $state([]);

    const ACCEPTED_TYPES = 'image/*,.pdf,.csv,.json,.txt,.md,.ts,.js,.py,.html,.css,.xml,.yaml,.yml,.toml,.sql,.sh,.log';

    const MIN_HEIGHT = 56;
    const MAX_HEIGHT = 200;

    function isImageFile(file: File): boolean {
        return file.type.startsWith('image/');
    }

    function addFiles(files: FileList | File[]) {
        for (const file of files) {
            const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const pending: PendingFile = { file, id };

            if (isImageFile(file)) {
                const reader = new FileReader();
                reader.onload = () => {
                    const idx = pendingFiles.findIndex((f) => f.id === id);
                    if (idx >= 0) {
                        pendingFiles[idx] = { ...pendingFiles[idx], preview: reader.result as string };
                        pendingFiles = [...pendingFiles];
                    }
                };
                reader.readAsDataURL(file);
            }

            pendingFiles = [...pendingFiles, pending];
        }
    }

    function removeFile(id: string) {
        pendingFiles = pendingFiles.filter((f) => f.id !== id);
    }

    function handleDragOver(e: DragEvent) {
        e.preventDefault();
        isDragOver = true;
    }

    function handleDragLeave(e: DragEvent) {
        e.preventDefault();
        isDragOver = false;
    }

    function handleDrop(e: DragEvent) {
        e.preventDefault();
        isDragOver = false;
        if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
            addFiles(e.dataTransfer.files);
        }
    }

    function handlePaste(e: ClipboardEvent) {
        const items = e.clipboardData?.items;
        if (!items) return;

        const imageFiles: File[] = [];
        for (const item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) imageFiles.push(file);
            }
        }

        if (imageFiles.length > 0) {
            e.preventDefault();
            addFiles(imageFiles);
        }
    }

    function openFilePicker() {
        fileInputRef?.click();
    }

    function handleFileSelect(e: Event) {
        const input = e.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            addFiles(input.files);
            input.value = '';
        }
    }

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
        const hasContent = message.trim() || pendingFiles.length > 0;
        if (!hasContent || disabled || loading) return;

        if (isSlashCommand(message) && onCommand) {
            onCommand(message.trim());
        } else {
            onSubmit(message.trim(), pendingFiles.length > 0 ? pendingFiles : undefined);
        }
        message = '';
        pendingFiles = [];
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
        {#if pendingFiles.length > 0}
            <div class="mb-2 flex flex-wrap gap-2 px-1">
                {#each pendingFiles as pf (pf.id)}
                    <div class="relative group flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-2 py-1.5">
                        {#if pf.preview}
                            <img src={pf.preview} alt={pf.file.name} class="h-10 w-10 rounded object-cover" />
                        {:else}
                            <div class="flex h-10 w-10 items-center justify-center rounded bg-muted/50">
                                <FileText class="h-4 w-4 text-muted-foreground" />
                            </div>
                        {/if}
                        <span class="max-w-[120px] truncate text-xs text-muted-foreground">{pf.file.name}</span>
                        <button
                            type="button"
                            onclick={() => removeFile(pf.id)}
                            class="flex h-5 w-5 items-center justify-center rounded-full bg-background/80 text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
                        >
                            <X class="h-3 w-3" />
                        </button>
                    </div>
                {/each}
            </div>
        {/if}

        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            bind:this={containerRef}
            class="relative input-glow rounded-2xl {isFocused ? 'ring-1 ring-primary/30' : ''} {isDragOver ? 'ring-2 ring-primary/50 bg-primary/5' : ''}"
            style="height: {MIN_HEIGHT}px"
            ondragover={handleDragOver}
            ondragleave={handleDragLeave}
            ondrop={handleDrop}
        >
            <CommandPalette
                {suggestions}
                {selectedIndex}
                onSelect={selectSuggestion}
            />

            {#if isDragOver}
                <div class="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-primary/5 border-2 border-dashed border-primary/40 pointer-events-none">
                    <span class="text-sm text-primary/70 font-medium">Drop files here</span>
                </div>
            {/if}

            <Textarea
                bind:ref={textareaRef}
                bind:value={message}
                placeholder="Ask Nero anything..."
                class="h-full w-full resize-none bg-transparent border-0 pr-24 pl-4 pt-4 font-mono text-sm placeholder:text-muted-foreground/40 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                onkeydown={handleKeyDown}
                oninput={handleInput}
                onpaste={handlePaste}
                onfocus={() => isFocused = true}
                onblur={() => isFocused = false}
                {disabled}
            />

            <input
                bind:this={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                multiple
                class="hidden"
                onchange={handleFileSelect}
            />

            <div class="absolute bottom-3 right-3 flex items-center gap-1.5">
                {#if !(loading && onAbort)}
                    <button
                        type="button"
                        onclick={openFilePicker}
                        disabled={disabled || loading}
                        class="relative flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground/50 transition-all hover:text-muted-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Attach file"
                    >
                        <Paperclip class="h-4 w-4" />
                    </button>
                {/if}

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
                        disabled={(!message.trim() && pendingFiles.length === 0) || disabled || loading}
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
