<script lang="ts">
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    import { streamChat, clearHistory, type ToolActivity } from '$lib/actions/chat';
    import { getHistory } from '$lib/actions/health';
    import { executeCommand, isSlashCommand, type CommandContext, type CommandWidget } from '$lib/commands';
    import ChatMessage from '$lib/components/chat/chat-message.svelte';
    import ChatInput from '$lib/components/chat/chat-input.svelte';
    import ToolActivityComponent from '$lib/components/chat/tool-activity.svelte';
    import PermissionModal from '$lib/components/chat/permission-modal.svelte';
    import GlitchLoader from '$lib/components/chat/glitch-loader.svelte';
    import CommandWidgetComponent from '$lib/components/chat/command-widget.svelte';
    import ArrowDown from '@lucide/svelte/icons/arrow-down';
    import Terminal from '@lucide/svelte/icons/terminal';
    import Cpu from '@lucide/svelte/icons/cpu';
    import Zap from '@lucide/svelte/icons/zap';
    import NeroIcon from '$lib/components/icons/nero-icon.svelte';

    type Message = {
        id: string;
        role: 'user' | 'assistant' | 'system';
        content: string;
        medium?: 'cli' | 'api' | 'voice' | 'sms' | 'slack';
    };

    type TimelineItem =
        | { type: 'message'; data: Message }
        | { type: 'activity'; data: ToolActivity; id: string }
        | { type: 'widget'; data: CommandWidget; id: string };

    let timeline: TimelineItem[] = $state([]);
    let loading = $state(false);
    let loadingText = $state('Thinking');
    let streamingContent = $state('');
    let scrollArea: HTMLDivElement | null = $state(null);
    let isAtBottom = $state(true);

    let permissionOpen = $state(false);
    let pendingPermissionId = $state('');
    let pendingActivity: ToolActivity | null = $state(null);

    const SCROLL_THRESHOLD = 100;

    onMount(async () => {
        const historyResponse = await getHistory();
        if (historyResponse.success) {
            timeline = historyResponse.data.messages.map((m, i) => ({
                type: 'message' as const,
                data: {
                    id: `history-${i}`,
                    role: m.role,
                    content: m.content,
                    medium: m.medium
                }
            }));
            scrollToBottom();
        }
    });

    function scrollToBottom() {
        if (!scrollArea) return;
        setTimeout(() => {
            scrollArea?.scrollTo({
                top: scrollArea.scrollHeight,
                behavior: 'smooth'
            });
        }, 0);
    }

    function handleScroll() {
        if (!scrollArea) return;
        const distanceFromBottom = scrollArea.scrollHeight - (scrollArea.scrollTop + scrollArea.clientHeight);
        isAtBottom = distanceFromBottom <= SCROLL_THRESHOLD;
    }

    const commandContext: CommandContext = {
        clearMessages: () => {
            timeline = [];
            clearHistory();
        },
        setLoading: (text) => {
            if (text) {
                loading = true;
                loadingText = text;
            } else {
                loading = false;
            }
        },
        log: (message) => {
            timeline = [...timeline, {
                type: 'message',
                data: {
                    id: `system-${Date.now()}`,
                    role: 'system',
                    content: message
                }
            }];
            scrollToBottom();
        },
        navigateTo: (path) => {
            goto(path);
        }
    };

    async function handleCommand(input: string) {
        timeline = [...timeline, {
            type: 'message',
            data: {
                id: `user-${Date.now()}`,
                role: 'user',
                content: input
            }
        }];
        scrollToBottom();

        const result = await executeCommand(input, commandContext);

        if (result.shouldClear) {
            return;
        }

        if (result.widget) {
            timeline = [...timeline, {
                type: 'widget',
                data: result.widget,
                id: `widget-${Date.now()}`
            }];
        } else if (result.message) {
            timeline = [...timeline, {
                type: 'message',
                data: {
                    id: `system-${Date.now()}`,
                    role: 'system',
                    content: result.message
                }
            }];
        }

        if (result.error) {
            timeline = [...timeline, {
                type: 'message',
                data: {
                    id: `system-${Date.now()}`,
                    role: 'system',
                    content: `Error: ${result.error}`
                }
            }];
        }

        scrollToBottom();
    }

    async function handleSendMessage(message: string) {
        timeline = [...timeline, {
            type: 'message',
            data: {
                id: `user-${Date.now()}`,
                role: 'user',
                content: message
            }
        }];
        loading = true;
        loadingText = 'Processing';
        streamingContent = '';
        scrollToBottom();

        await streamChat({
            message,
            callbacks: {
                onChunk: (chunk) => {
                    streamingContent += chunk;
                    if (isAtBottom) scrollToBottom();
                },
                onActivity: (activity) => {
                    loadingText = `Calling ${activity.tool}`;

                    if (streamingContent.trim()) {
                        timeline = [...timeline, {
                            type: 'message',
                            data: {
                                id: `assistant-${Date.now()}`,
                                role: 'assistant',
                                content: streamingContent
                            }
                        }];
                        streamingContent = '';
                    }

                    const activityId = `${activity.tool}-${JSON.stringify(activity.args)}`;
                    const existingIndex = timeline.findIndex(
                        item => item.type === 'activity' && item.id === activityId
                    );

                    if (existingIndex >= 0) {
                        timeline = [
                            ...timeline.slice(0, existingIndex),
                            { type: 'activity', data: activity, id: activityId },
                            ...timeline.slice(existingIndex + 1)
                        ];
                    } else {
                        timeline = [...timeline, { type: 'activity', data: activity, id: activityId }];
                    }

                    if (isAtBottom) scrollToBottom();
                },
                onPermission: (id, activity) => {
                    pendingPermissionId = id;
                    pendingActivity = activity;
                    permissionOpen = true;
                },
                onDone: (content) => {
                    const finalContent = content || streamingContent;
                    if (finalContent.trim()) {
                        timeline = [...timeline, {
                            type: 'message',
                            data: {
                                id: `assistant-${Date.now()}`,
                                role: 'assistant',
                                content: finalContent
                            }
                        }];
                    }
                    streamingContent = '';
                    loading = false;
                    scrollToBottom();
                },
                onError: (error) => {
                    console.error('Chat error:', error);
                    loading = false;
                    streamingContent = '';
                }
            }
        });
    }

    function handlePermissionResponse() {
        pendingPermissionId = '';
        pendingActivity = null;
    }
</script>

<div class="flex h-full flex-col relative">
    <div class="absolute inset-0 pointer-events-none overflow-hidden">
        <div class="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
        <div class="absolute bottom-1/3 right-1/4 w-64 h-64 bg-[hsl(var(--nero-cyan))]/3 rounded-full blur-3xl"></div>
    </div>

    <div
        bind:this={scrollArea}
        class="flex-1 overflow-y-auto relative"
        onscroll={handleScroll}
    >
        <div class="mx-auto max-w-3xl space-y-6 p-4 pb-8">
            {#if timeline.length === 0 && !loading}
                <div class="flex h-[70vh] flex-col items-center justify-center text-center px-4">
                    <div class="relative mb-10">
                        <div class="absolute inset-0 blur-3xl bg-primary/25 rounded-full scale-[2]"></div>

                        <div class="absolute inset-[-40px] rounded-full border border-primary/10 animate-orbit opacity-30"></div>
                        <div class="absolute inset-[-70px] rounded-full border border-primary/5 animate-orbit opacity-20" style="animation-duration: 30s; animation-direction: reverse;"></div>
                        <div class="absolute inset-[-100px] rounded-full border border-primary/[0.03] animate-orbit opacity-10" style="animation-duration: 45s;"></div>

                        <div class="absolute inset-[-40px] flex items-center justify-center animate-orbit" style="animation-duration: 20s;">
                            <div class="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-primary/40"></div>
                        </div>

                        <div class="relative animate-icon-pulse">
                            <NeroIcon class="h-24 w-20 text-primary nero-glow-strong" />
                        </div>
                    </div>

                    <h1 class="text-4xl font-semibold tracking-tight mb-3 opacity-0 animate-[floatUp_0.6s_ease-out_0.2s_forwards]">
                        <span class="text-gradient-nero">Nero</span>
                    </h1>

                    <p class="text-muted-foreground/80 text-lg mb-2 max-w-md opacity-0 animate-[floatUp_0.6s_ease-out_0.3s_forwards]">
                        Your AI companion is online
                    </p>

                    <p class="text-muted-foreground/50 text-sm mb-10 max-w-sm opacity-0 animate-[floatUp_0.6s_ease-out_0.35s_forwards]">
                        Ask anything or use commands to explore capabilities
                    </p>

                    <div class="flex flex-wrap justify-center gap-3 opacity-0 animate-[floatUp_0.6s_ease-out_0.4s_forwards]">
                        <button
                            type="button"
                            onclick={() => handleCommand('/help')}
                            class="group relative flex items-center gap-3 rounded-xl px-5 py-3 text-left transition-all glass-panel hover:border-primary/30"
                        >
                            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 text-primary group-hover:nero-glow-subtle transition-all">
                                <Terminal class="h-5 w-5" />
                            </div>
                            <div>
                                <div class="font-mono text-sm font-medium text-foreground">/help</div>
                                <div class="text-xs text-muted-foreground/70">View commands</div>
                            </div>
                        </button>

                        <button
                            type="button"
                            onclick={() => handleCommand('/tools')}
                            class="group relative flex items-center gap-3 rounded-xl px-5 py-3 text-left transition-all glass-panel hover:border-primary/30"
                        >
                            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 text-primary group-hover:nero-glow-subtle transition-all">
                                <Cpu class="h-5 w-5" />
                            </div>
                            <div>
                                <div class="font-mono text-sm font-medium text-foreground">/tools</div>
                                <div class="text-xs text-muted-foreground/70">MCP tools</div>
                            </div>
                        </button>

                        <button
                            type="button"
                            onclick={() => handleCommand('/status')}
                            class="group relative flex items-center gap-3 rounded-xl px-5 py-3 text-left transition-all glass-panel hover:border-primary/30"
                        >
                            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 text-primary group-hover:nero-glow-subtle transition-all">
                                <Zap class="h-5 w-5" />
                            </div>
                            <div>
                                <div class="font-mono text-sm font-medium text-foreground">/status</div>
                                <div class="text-xs text-muted-foreground/70">System info</div>
                            </div>
                        </button>
                    </div>

                    <div class="mt-12 flex items-center gap-6 text-xs text-muted-foreground/40 opacity-0 animate-[floatUp_0.6s_ease-out_0.5s_forwards]">
                        <div class="flex items-center gap-2">
                            <div class="w-1.5 h-1.5 rounded-full bg-green-500/60 animate-pulse"></div>
                            <span>Connected</span>
                        </div>
                        <div class="w-px h-3 bg-border/50"></div>
                        <span>Type a message to begin</span>
                    </div>
                </div>
            {/if}

            {#each timeline as item}
                {#if item.type === 'message'}
                    <ChatMessage role={item.data.role} content={item.data.content} medium={item.data.medium} />
                {:else if item.type === 'activity'}
                    <ToolActivityComponent activity={item.data} />
                {:else if item.type === 'widget'}
                    <CommandWidgetComponent widget={item.data} />
                {/if}
            {/each}

            {#if streamingContent}
                <ChatMessage role="assistant" content={streamingContent} isStreaming={true} />
            {/if}

            {#if loading && !streamingContent}
                <div class="message-appear">
                    <GlitchLoader text={loadingText} />
                </div>
            {/if}
        </div>
    </div>

    <div class="relative">
        {#if !isAtBottom}
            <div class="absolute -top-16 left-1/2 -translate-x-1/2 z-10">
                <button
                    type="button"
                    class="relative flex h-10 w-10 items-center justify-center rounded-full glass-panel hover:border-primary/40 transition-all group"
                    onclick={scrollToBottom}
                >
                    <div class="absolute inset-0 rounded-full bg-primary/10 blur-lg opacity-0 group-hover:opacity-60 transition-opacity"></div>
                    <ArrowDown class="relative h-4 w-4 text-primary" />
                </button>
            </div>
        {/if}
        <ChatInput onSubmit={handleSendMessage} onCommand={handleCommand} {loading} />
    </div>
</div>

{#if pendingActivity}
    <PermissionModal
        bind:open={permissionOpen}
        permissionId={pendingPermissionId}
        activity={pendingActivity}
        onResponse={handlePermissionResponse}
    />
{/if}
