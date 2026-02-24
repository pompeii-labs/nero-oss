<script lang="ts">
    import { onMount, onDestroy, tick } from 'svelte';
    import InterfaceRenderer from './interface-renderer.svelte';
    import {
        handleAction as executeAction,
        connectInterfaceSSE,
    } from '$lib/actions/interface-actions';
    import X from '@lucide/svelte/icons/x';
    import GripVertical from '@lucide/svelte/icons/grip-vertical';
    import CheckCircle from '@lucide/svelte/icons/check-circle-2';
    import XCircle from '@lucide/svelte/icons/x-circle';

    let {
        schema,
        onClose,
    }: {
        schema: any;
        onClose: (id: string) => void;
    } = $props();

    let localState = $state<Record<string, any>>({});
    let components = $state<any[]>([]);
    let title = $state('');
    let panelWidth = $state(400);
    let panelHeight = $state<number | undefined>(undefined);
    let accentColor = $state<string | undefined>(undefined);
    let toasts = $state<{ id: number; message: string; type: 'success' | 'error' }[]>([]);
    let toastCounter = 0;

    let panelEl: HTMLDivElement | null = $state(null);
    let bodyEl: HTMLDivElement | null = $state(null);
    let isDragging = $state(false);
    let dragOffset = { x: 0, y: 0 };
    let position = $state({ x: 0, y: 0 });
    let hasBeenDragged = $state(false);
    let userHasScrolledUp = false;

    let cleanup: (() => void) | null = null;

    function scrollBodyToBottom() {
        if (!bodyEl || userHasScrolledUp) return;
        tick().then(() => {
            if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight;
        });
    }

    function onBodyScroll() {
        if (!bodyEl) return;
        const distFromBottom = bodyEl.scrollHeight - bodyEl.scrollTop - bodyEl.clientHeight;
        userHasScrolledUp = distFromBottom > 30;
    }

    function addToast(message: string, type: 'success' | 'error') {
        const toastId = ++toastCounter;
        toasts = [...toasts, { id: toastId, message, type }];
        setTimeout(() => {
            toasts = toasts.filter((t) => t.id !== toastId);
        }, 4000);
    }

    onMount(() => {
        title = schema.title;
        panelWidth = schema.width || 400;
        panelHeight = schema.height;
        accentColor = schema.accentColor;
        components = schema.components || [];
        localState = { ...(schema.state || {}) };

        cleanup = connectInterfaceSSE(schema.id, {
            onUpdate: (patch: any) => {
                if (patch.title) title = patch.title;
                if (patch.width) panelWidth = patch.width;
                if (patch.height) panelHeight = patch.height;
                if (patch.accentColor) accentColor = patch.accentColor;
                if (patch.components) {
                    const incoming = patch.components as any[];
                    const incomingMap = new Map(incoming.map((c: any) => [c.id, c]));
                    const merged = components.map((c: any) => incomingMap.get(c.id) ?? c);
                    for (const c of incoming) {
                        if (!components.some((e: any) => e.id === c.id)) merged.push(c);
                    }
                    components = merged;
                }
                if (patch.addComponents) {
                    components = [...components, ...patch.addComponents];
                }
                if (patch.removeComponentIds) {
                    const removeSet = new Set(patch.removeComponentIds);
                    components = components.filter((c: any) => !removeSet.has(c.id));
                }
                if (patch.state) {
                    localState = { ...localState, ...patch.state };
                }
                scrollBodyToBottom();
            },
            onClose: () => {
                onClose(schema.id);
            },
            onStateChange: (key: string, value: any) => {
                localState = { ...localState, [key]: value };
                scrollBodyToBottom();
            },
        });

        tick().then(() => scrollBodyToBottom());
    });

    onDestroy(() => {
        cleanup?.();
    });

    async function handleAction(action: any): Promise<{ success: boolean; result?: string }> {
        return executeAction(
            schema.id,
            action,
            localState,
            (key, value) => {
                localState = { ...localState, [key]: value };
            },
            addToast
        );
    }

    function onDragStart(e: PointerEvent) {
        if (!panelEl) return;
        isDragging = true;
        hasBeenDragged = true;
        const rect = panelEl.getBoundingClientRect();
        dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }

    function onDragMove(e: PointerEvent) {
        if (!isDragging) return;
        position = {
            x: e.clientX - dragOffset.x,
            y: e.clientY - dragOffset.y,
        };
    }

    function onDragEnd() {
        isDragging = false;
    }
</script>

<div
    bind:this={panelEl}
    class="display-panel"
    class:dragging={isDragging}
    style="
        {hasBeenDragged ? `position: fixed; left: ${position.x}px; top: ${position.y}px;` : ''}
        {accentColor ? `--panel-accent: ${accentColor};` : '--panel-accent: var(--nero-blue);'}
        width: {panelWidth}px;
        {panelHeight ? `--panel-max-height: ${panelHeight}px;` : ''}
    "
>
    <div
        class="panel-header"
        onpointerdown={onDragStart}
        onpointermove={onDragMove}
        onpointerup={onDragEnd}
    >
        <div class="flex items-center gap-2 min-w-0">
            <GripVertical class="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 cursor-grab" />
            <span class="text-xs font-medium text-foreground truncate">{title}</span>
        </div>
        <button
            type="button"
            class="close-btn"
            onclick={() => onClose(schema.id)}
        >
            <X class="h-3 w-3" />
        </button>
    </div>

    <div class="panel-body" bind:this={bodyEl} onscroll={onBodyScroll}>
        <InterfaceRenderer {components} state={localState} onAction={handleAction} />
    </div>

    {#if toasts.length > 0}
        <div class="panel-toasts">
            {#each toasts as toast (toast.id)}
                <div
                    class="panel-toast"
                    class:toast-error={toast.type === 'error'}
                    class:toast-success={toast.type === 'success'}
                >
                    {#if toast.type === 'error'}
                        <XCircle class="h-3 w-3 shrink-0" />
                    {:else}
                        <CheckCircle class="h-3 w-3 shrink-0" />
                    {/if}
                    <span class="truncate">{toast.message}</span>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .display-panel {
        position: relative;
        border-radius: 12px;
        border: 1px solid color-mix(in srgb, var(--panel-accent) 25%, transparent);
        background: var(--background);
        box-shadow:
            0 4px 24px rgba(0, 0, 0, 0.3),
            0 0 0 1px rgba(255, 255, 255, 0.03),
            0 0 40px color-mix(in srgb, var(--panel-accent) 8%, transparent);
        overflow: hidden;
        animation: panelIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 10;
    }

    .display-panel.dragging {
        z-index: 100;
        opacity: 0.95;
    }

    .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        border-bottom: 1px solid color-mix(in srgb, var(--panel-accent) 15%, transparent);
        background: color-mix(in srgb, var(--panel-accent) 5%, transparent);
        cursor: grab;
        user-select: none;
        touch-action: none;
    }

    .panel-header:active {
        cursor: grabbing;
    }

    .close-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 6px;
        color: color-mix(in srgb, var(--muted-foreground) 50%, transparent);
        transition: all 0.15s;
        flex-shrink: 0;
    }

    .close-btn:hover {
        background: color-mix(in srgb, var(--destructive) 15%, transparent);
        color: var(--destructive);
    }

    .panel-body {
        padding: 12px;
        max-height: var(--panel-max-height, 400px);
        overflow-y: auto;
    }

    .panel-body :global(.space-y-3 > :not([hidden]) ~ :not([hidden])) {
        margin-top: 0.75rem;
    }

    .panel-toasts {
        position: absolute;
        bottom: 8px;
        left: 8px;
        right: 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        z-index: 50;
        pointer-events: none;
    }

    .panel-toast {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        border-radius: 8px;
        font-size: 11px;
        backdrop-filter: blur(8px);
        pointer-events: auto;
        animation: panelIn 0.2s ease-out;
    }

    .toast-error {
        background: color-mix(in srgb, var(--destructive) 15%, transparent);
        color: var(--destructive);
        border: 1px solid color-mix(in srgb, var(--destructive) 20%, transparent);
    }

    .toast-success {
        background: rgba(16, 185, 129, 0.15);
        color: rgb(110, 231, 183);
        border: 1px solid rgba(16, 185, 129, 0.2);
    }

    @keyframes panelIn {
        from {
            opacity: 0;
            transform: translateY(8px) scale(0.97);
        }
        to {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }
</style>
