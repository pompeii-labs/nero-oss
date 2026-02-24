<script lang="ts">
    import { page } from '$app/stores';
    import { onMount, onDestroy } from 'svelte';
    import { get } from '$lib/actions/helpers';
    import {
        handleAction as executeAction,
        connectInterfaceSSE,
    } from '$lib/actions/interface-actions';
    import InterfaceRenderer from '$lib/components/interface/interface-renderer.svelte';
    import Loader2 from '@lucide/svelte/icons/loader-2';
    import AlertCircle from '@lucide/svelte/icons/alert-circle';
    import CheckCircle from '@lucide/svelte/icons/check-circle-2';
    import XCircle from '@lucide/svelte/icons/x-circle';

    let schema = $state<any>(null);
    let localState = $state<Record<string, any>>({});
    let error = $state<string | null>(null);
    let loading = $state(true);
    let toasts = $state<{ id: number; message: string; type: 'success' | 'error' }[]>([]);
    let toastCounter = 0;
    let cleanup: (() => void) | null = null;

    const id = $derived($page.params.id);

    function addToast(message: string, type: 'success' | 'error') {
        const toastId = ++toastCounter;
        toasts = [...toasts, { id: toastId, message, type }];
        setTimeout(() => {
            toasts = toasts.filter((t) => t.id !== toastId);
        }, 4000);
    }

    onMount(async () => {
        await loadSchema();
    });

    onDestroy(() => {
        cleanup?.();
    });

    async function loadSchema() {
        const result = await get<any>(`/api/interfaces/${id}`);
        if (!result.success) {
            error = 'Interface not found';
            loading = false;
            return;
        }

        schema = result.data;
        localState = { ...(schema.state || {}) };

        if (schema.accentColor) {
            document.documentElement.style.setProperty('--ni-accent', schema.accentColor);
        } else {
            document.documentElement.style.setProperty('--ni-accent', 'var(--nero-blue)');
        }

        document.title = schema.title;
        loading = false;

        cleanup = connectInterfaceSSE(id!, {
            onUpdate: (patch: any) => {
                if (patch.title) {
                    schema.title = patch.title;
                    document.title = patch.title;
                }
                if (patch.accentColor) {
                    schema.accentColor = patch.accentColor;
                    document.documentElement.style.setProperty('--ni-accent', patch.accentColor);
                }
                if (patch.components) {
                    const incoming = patch.components as any[];
                    const incomingMap = new Map(incoming.map((c: any) => [c.id, c]));
                    const merged = schema.components.map((c: any) => incomingMap.get(c.id) ?? c);
                    for (const c of incoming) {
                        if (!schema.components.some((e: any) => e.id === c.id)) merged.push(c);
                    }
                    schema = { ...schema, components: merged };
                }
                if (patch.addComponents) {
                    schema = { ...schema, components: [...schema.components, ...patch.addComponents] };
                }
                if (patch.removeComponentIds) {
                    const removeSet = new Set(patch.removeComponentIds);
                    schema = { ...schema, components: schema.components.filter((c: any) => !removeSet.has(c.id)) };
                }
                if (patch.state) {
                    localState = { ...localState, ...patch.state };
                }
            },
            onClose: () => {
                window.close();
            },
            onStateChange: (key: string, value: any) => {
                localState = { ...localState, [key]: value };
            },
        });
    }

    async function handleAction(action: any): Promise<{ success: boolean; result?: string }> {
        return executeAction(
            id!,
            action,
            localState,
            (key, value) => {
                localState = { ...localState, [key]: value };
            },
            addToast
        );
    }
</script>

<svelte:head>
    <title>Nero Interface</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="theme-color" content="#080a0d" />
    <meta name="color-scheme" content="dark" />
</svelte:head>

<div class="h-screen w-full bg-background font-body overflow-hidden">
    {#if loading}
        <div class="flex h-full items-center justify-center">
            <Loader2 class="h-8 w-8 text-primary animate-spin" />
        </div>
    {:else if error}
        <div class="flex h-full flex-col items-center justify-center gap-3 p-6">
            <AlertCircle class="h-10 w-10 text-red-400" />
            <p class="text-red-400 text-sm">{error}</p>
        </div>
    {:else if schema}
        <div class="h-full overflow-auto p-4">
            <div class="space-y-3">
                <InterfaceRenderer
                    components={schema.components}
                    state={localState}
                    onAction={handleAction}
                />
            </div>
        </div>
    {/if}

    {#if toasts.length > 0}
        <div class="fixed bottom-3 left-3 right-3 flex flex-col gap-2 z-50 pointer-events-none">
            {#each toasts as toast (toast.id)}
                <div
                    class="pointer-events-auto flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs shadow-lg backdrop-blur-sm animate-in
                        {toast.type === 'error'
                            ? 'bg-red-500/15 text-red-300 border border-red-500/20'
                            : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20'}"
                >
                    {#if toast.type === 'error'}
                        <XCircle class="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    {:else}
                        <CheckCircle class="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    {/if}
                    <span class="break-words leading-relaxed">{toast.message}</span>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    :global(:root) {
        --ni-accent: var(--nero-blue);
    }

    .animate-in {
        animation: toast-in 0.2s ease-out;
    }

    @keyframes toast-in {
        from {
            opacity: 0;
            transform: translateY(8px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
</style>
