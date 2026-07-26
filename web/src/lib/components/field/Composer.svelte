<script lang="ts">
    import { getSuggestions, isSlashCommand, type Suggestion } from '$lib/commands';
    import ArrowUp from '@lucide/svelte/icons/arrow-up';
    import Square from '@lucide/svelte/icons/square';
    import Paperclip from '@lucide/svelte/icons/paperclip';
    import X from '@lucide/svelte/icons/x';
    import FileText from '@lucide/svelte/icons/file-text';

    export type PendingFile = { file: File; preview?: string; id: string };

    let {
        onSubmit,
        onCommand,
        onAbort,
        disabled = false,
        loading = false,
    }: {
        onSubmit: (message: string, files?: PendingFile[]) => void;
        onCommand?: (command: string) => void;
        onAbort?: () => void;
        disabled?: boolean;
        loading?: boolean;
    } = $props();

    let message = $state('');
    let textareaRef: HTMLTextAreaElement | null = $state(null);
    let fileInputRef: HTMLInputElement | null = $state(null);
    let suggestions: Suggestion[] = $state([]);
    let selectedIndex = $state(0);
    let isDragOver = $state(false);
    let pendingFiles: PendingFile[] = $state([]);

    const ACCEPTED =
        'image/*,.pdf,.csv,.json,.txt,.md,.ts,.js,.py,.html,.css,.xml,.yaml,.yml,.toml,.sql,.sh,.log';

    function addFiles(files: FileList | File[]) {
        for (const file of files) {
            const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const pending: PendingFile = { file, id };
            if (file.type.startsWith('image/')) {
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
    const removeFile = (id: string) => (pendingFiles = pendingFiles.filter((f) => f.id !== id));

    function handleDrop(e: DragEvent) {
        e.preventDefault();
        isDragOver = false;
        if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
    }
    function handlePaste(e: ClipboardEvent) {
        const imgs: File[] = [];
        for (const item of e.clipboardData?.items ?? []) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const f = item.getAsFile();
                if (f) imgs.push(f);
            }
        }
        if (imgs.length) {
            e.preventDefault();
            addFiles(imgs);
        }
    }
    function handleFileSelect(e: Event) {
        const input = e.target as HTMLInputElement;
        if (input.files?.length) {
            addFiles(input.files);
            input.value = '';
        }
    }

    async function updateSuggestions() {
        if (isSlashCommand(message) && !message.includes(' ')) {
            suggestions = await getSuggestions(message.slice(1).split(/\s+/)[0] || '');
            selectedIndex = 0;
        } else {
            suggestions = [];
        }
    }

    function submit() {
        const hasContent = message.trim() || pendingFiles.length > 0;
        // Sending while loading is allowed: it steers the in-flight reply (the
        // backend folds it into the active dispatch at the next tool boundary).
        if (!hasContent || disabled) return;
        if (isSlashCommand(message) && onCommand) onCommand(message.trim());
        else onSubmit(message.trim(), pendingFiles.length ? pendingFiles : undefined);
        message = '';
        pendingFiles = [];
        suggestions = [];
        textareaRef?.focus();
    }

    function pickSuggestion(s: Suggestion) {
        message = s.type === 'command' ? `/${s.command.name} ` : `/${s.name} `;
        suggestions = [];
        textareaRef?.focus();
    }

    function handleKeyDown(e: KeyboardEvent) {
        if (loading && onAbort && (e.key === 'Escape' || (e.key === 'c' && (e.ctrlKey || e.metaKey)))) {
            e.preventDefault();
            onAbort();
            return;
        }
        if (suggestions.length) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % suggestions.length;
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = (selectedIndex - 1 + suggestions.length) % suggestions.length;
                return;
            }
            if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                e.preventDefault();
                pickSuggestion(suggestions[selectedIndex]);
                return;
            }
            if (e.key === 'Escape') {
                suggestions = [];
                return;
            }
        }
        if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            submit();
        } else if (e.key === 'Escape') {
            textareaRef?.blur();
        }
    }

    // Press "/" anywhere to focus the composer.
    $effect(() => {
        function onGlobalKey(e: KeyboardEvent) {
            if (e.key !== '/') return;
            const el = document.activeElement as HTMLElement | null;
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
            e.preventDefault();
            textareaRef?.focus();
        }
        window.addEventListener('keydown', onGlobalKey);
        return () => window.removeEventListener('keydown', onGlobalKey);
    });

    // Autosize.
    $effect(() => {
        message;
        if (!textareaRef) return;
        textareaRef.style.height = 'auto';
        textareaRef.style.height = Math.min(Math.max(textareaRef.scrollHeight, 24), 200) + 'px';
    });
</script>

<div class="composer">
    {#if pendingFiles.length}
        <div class="chips">
            {#each pendingFiles as pf (pf.id)}
                <div class="chip">
                    {#if pf.preview}
                        <img src={pf.preview} alt={pf.file.name} />
                    {:else}
                        <span class="chip-ico"><FileText size={14} /></span>
                    {/if}
                    <span class="chip-name">{pf.file.name}</span>
                    <button type="button" class="chip-x" onclick={() => removeFile(pf.id)} aria-label="Remove">
                        <X size={12} />
                    </button>
                </div>
            {/each}
        </div>
    {/if}

    {#if suggestions.length}
        <div class="suggest">
            {#each suggestions as s, i (s.type === 'command' ? s.command.name : s.name)}
                <button
                    type="button"
                    class="sg"
                    class:on={i === selectedIndex}
                    onclick={() => pickSuggestion(s)}
                >
                    <span class="sg-name">/{s.type === 'command' ? s.command.name : s.name}</span>
                    <span class="sg-desc">{s.type === 'command' ? s.command.description : s.description}</span>
                </button>
            {/each}
        </div>
    {/if}

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="input"
        class:drag={isDragOver}
        ondragover={(e) => {
            e.preventDefault();
            isDragOver = true;
        }}
        ondragleave={(e) => {
            e.preventDefault();
            isDragOver = false;
        }}
        ondrop={handleDrop}
    >
        <span class="prompt">›</span>
        <textarea
            bind:this={textareaRef}
            bind:value={message}
            placeholder="Message Nero"
            rows="1"
            {disabled}
            onkeydown={handleKeyDown}
            oninput={updateSuggestions}
            onpaste={handlePaste}
        ></textarea>

        <input
            bind:this={fileInputRef}
            type="file"
            accept={ACCEPTED}
            multiple
            class="hidden-file"
            onchange={handleFileSelect}
        />

        {#if loading && onAbort}
            <button type="button" class="btn stop" onclick={onAbort} title="Stop (Esc)" aria-label="Stop">
                <Square size={13} fill="currentColor" />
            </button>
            <button
                type="button"
                class="btn send"
                onclick={submit}
                disabled={(!message.trim() && !pendingFiles.length) || disabled}
                title="Send while Nero is working — steers the current reply"
                aria-label="Send"
            >
                <ArrowUp size={15} />
            </button>
        {:else}
            <button
                type="button"
                class="btn attach"
                onclick={() => fileInputRef?.click()}
                disabled={disabled}
                title="Attach"
                aria-label="Attach file"
            >
                <Paperclip size={15} />
            </button>
            <button
                type="button"
                class="btn send"
                onclick={submit}
                disabled={(!message.trim() && !pendingFiles.length) || disabled}
                aria-label="Send"
            >
                <ArrowUp size={15} />
            </button>
        {/if}

        {#if isDragOver}<div class="dropmask">Drop files</div>{/if}
    </div>
</div>

<style>
    .composer {
        width: min(620px, 78vw);
        position: relative;
    }
    @media (max-width: 640px) {
        .composer {
            width: 100%;
        }
    }
    .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 10px;
        padding: 0 4px;
    }
    .chip {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 8px;
        border-radius: 8px;
        background: rgb(var(--holo) / 0.06);
        border: 1px solid rgb(var(--holo) / 0.16);
    }
    .chip img {
        width: 34px;
        height: 34px;
        border-radius: 5px;
        object-fit: cover;
    }
    .chip-ico {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border-radius: 5px;
        background: rgb(var(--holo) / 0.1);
        color: var(--text-dim);
    }
    .chip-name {
        max-width: 130px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
        color: var(--text-dim);
    }
    .chip-x {
        display: grid;
        place-items: center;
        width: 18px;
        height: 18px;
        border: none;
        border-radius: 999px;
        background: var(--sunken);
        color: var(--text-dim);
        cursor: pointer;
    }
    .chip-x:hover { color: var(--text); }

    .suggest {
        position: absolute;
        bottom: calc(100% + 8px);
        left: 0;
        right: 0;
        padding: 6px;
        border-radius: 12px;
        background: var(--panel-bg);
        border: 1px solid rgb(var(--holo) / 0.16);
        backdrop-filter: blur(10px);
        box-shadow: 0 20px 50px -20px rgb(0 0 0 / 0.85);
        max-height: 260px;
        overflow-y: auto;
        z-index: 5;
    }
    .sg {
        display: flex;
        flex-direction: column;
        gap: 2px;
        width: 100%;
        text-align: left;
        padding: 8px 10px;
        border: none;
        border-radius: 8px;
        background: none;
        cursor: pointer;
    }
    .sg.on { background: rgb(var(--holo) / 0.1); }
    .sg-name {
        font-family: var(--font-mono);
        font-size: 12px;
        color: rgb(var(--holo-soft));
    }
    .sg-desc {
        font-size: 11px;
        color: var(--text-dim);
    }

    .input {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 10px 10px 16px;
        border-radius: 20px;
        background: var(--glass-tint);
        border: 1px solid var(--glass-edge);
        backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
        -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
        box-shadow:
            inset 0 1px 0 var(--glass-hi),
            inset 0 -1px 0 var(--glass-shade),
            0 0 40px -14px rgb(var(--holo) / 0.22),
            var(--glass-lift);
        transition: border-color 0.25s, box-shadow 0.25s;
        position: relative;
    }
    .input:focus-within {
        border-color: rgb(var(--holo) / 0.5);
        box-shadow:
            inset 0 1px 0 var(--glass-hi),
            inset 0 -1px 0 var(--glass-shade),
            0 0 54px -10px rgb(var(--holo) / 0.4),
            var(--glass-lift);
    }
    .input.drag { border-color: rgb(var(--holo) / 0.6); }
    .prompt {
        font-family: var(--font-mono);
        color: rgb(var(--holo));
        font-size: 15px;
        line-height: 1;
        align-self: center;
    }
    textarea {
        flex: 1;
        resize: none;
        background: none;
        border: none;
        outline: none;
        color: var(--text);
        font-family: var(--font-ui);
        font-size: 14px;
        line-height: 1.5;
        max-height: 200px;
        padding: 0;
        display: block;
    }
    textarea::placeholder { color: var(--text-faint); }
    .hidden-file { display: none; }

    .btn {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        flex-shrink: 0;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.18s;
    }
    .btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
    .attach {
        background: transparent;
        color: var(--text-dim);
    }
    .attach:not(:disabled):hover {
        background: rgb(var(--holo) / 0.1);
        color: var(--text);
    }
    .send {
        color: var(--void);
        background: linear-gradient(180deg, rgb(var(--holo-soft)), rgb(var(--holo)));
        box-shadow: 0 0 16px -2px rgb(var(--holo) / 0.6);
    }
    .send:not(:disabled):hover { filter: brightness(1.08); }
    .stop {
        background: rgb(var(--holo) / 0.12);
        color: var(--text);
    }
    .stop:hover { background: rgb(var(--holo) / 0.2); }

    .dropmask {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        border-radius: 16px;
        border: 1.5px dashed rgb(var(--holo) / 0.5);
        background: rgb(var(--holo) / 0.06);
        font-family: var(--font-mono);
        font-size: 12px;
        color: rgb(var(--holo-soft));
        pointer-events: none;
    }
</style>
