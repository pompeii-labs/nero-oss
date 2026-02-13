import { getServerUrl, post, del, type NeroResult } from './helpers';

export type ToolActivity = {
    id: string;
    tool: string;
    displayName?: string;
    args: Record<string, unknown>;
    status: 'pending' | 'approved' | 'denied' | 'skipped' | 'running' | 'complete' | 'error';
    result?: string;
    error?: string;
    skipReason?: string;
    subagentId?: string;
    subagentTask?: string;
    dispatchId?: string;
};

export type ChatSSEEvent =
    | { type: 'chunk'; data: string }
    | { type: 'activity'; data: ToolActivity }
    | { type: 'permission'; id: string; data: ToolActivity }
    | { type: 'done'; data: { content: string } }
    | { type: 'error'; data: string };

export type StreamCallbacks = {
    onChunk?: (chunk: string) => void;
    onActivity?: (activity: ToolActivity) => void;
    onPermission?: (id: string, activity: ToolActivity) => void;
    onDone?: (content: string) => void;
    onError?: (error: string) => void;
};

export type AttachmentUpload = {
    data: string;
    name: string;
    mimeType: string;
};

export async function streamChat(args: {
    message: string;
    attachments?: AttachmentUpload[];
    callbacks: StreamCallbacks;
    signal?: AbortSignal;
}): Promise<void> {
    const url = getServerUrl('/api/chat');

    const body: Record<string, unknown> = { message: args.message, medium: 'api' };
    if (args.attachments && args.attachments.length > 0) {
        body.attachments = args.attachments;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
        },
        body: JSON.stringify(body),
        signal: args.signal,
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => `HTTP ${response.status}`);
        args.callbacks.onError?.(errorText || `HTTP ${response.status}`);
        return;
    }

    if (!response.body) {
        args.callbacks.onError?.('No response body');
        return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');

            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim() || line.startsWith(':')) continue;

                if (line.startsWith('data: ')) {
                    const jsonStr = line.slice(6);
                    if (!jsonStr || jsonStr === '{}') continue;

                    try {
                        const event = JSON.parse(jsonStr) as ChatSSEEvent;

                        switch (event.type) {
                            case 'chunk':
                                args.callbacks.onChunk?.(event.data);
                                break;
                            case 'activity':
                                args.callbacks.onActivity?.(event.data);
                                break;
                            case 'permission':
                                args.callbacks.onPermission?.(event.id, event.data);
                                break;
                            case 'done':
                                args.callbacks.onDone?.(event.data.content);
                                break;
                            case 'error':
                                args.callbacks.onError?.(event.data);
                                break;
                        }
                    } catch {
                        console.error('Failed to parse SSE event:', jsonStr);
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

export async function respondToPermission(
    id: string,
    approved: boolean,
    alwaysAllow = false,
): Promise<boolean> {
    const result = await post(`/api/permission/${id}`, { approved, alwaysAllow });
    return result.success;
}

export async function addAlwaysAllowTool(tool: string): Promise<boolean> {
    const result = await post('/api/permissions/allow', { tool });
    return result.success;
}

export async function getAllowedTools(): Promise<string[]> {
    const result = await import('./helpers').then((h) =>
        h.get<{ allowed: string[] }>('/api/permissions'),
    );
    if (result.success) return result.data.allowed || [];
    return [];
}

export async function removeAllowedTool(tool: string): Promise<boolean> {
    const result = await del(`/api/permissions/allow/${encodeURIComponent(tool)}`);
    return result.success;
}

export async function compactContext(): Promise<{ success: boolean; summary?: string }> {
    const result = await post<{ summary: string }>('/api/compact');
    if (result.success) return { success: true, summary: result.data.summary };
    return { success: false };
}

export async function clearHistory(): Promise<{ success: boolean }> {
    const result = await post('/api/clear');
    return { success: result.success };
}

export async function abortChat(): Promise<{ success: boolean; message?: string }> {
    const result = await post<{ message: string }>('/api/abort');
    if (result.success) return { success: true, message: result.data.message };
    return { success: false };
}

export type ThinkSSEEvent =
    | { type: 'activity'; data: ToolActivity }
    | { type: 'status'; data: string }
    | { type: 'done'; data: { thought: string | null; urgent: boolean } }
    | { type: 'error'; data: string };

export type ThinkCallbacks = {
    onActivity?: (activity: ToolActivity) => void;
    onStatus?: (status: string) => void;
    onDone?: (thought: string | null, urgent: boolean) => void;
    onError?: (error: string) => void;
};

export async function streamThink(args: {
    callbacks: ThinkCallbacks;
    signal?: AbortSignal;
}): Promise<void> {
    const url = getServerUrl('/api/think');

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Accept: 'text/event-stream',
        },
        signal: args.signal,
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => `HTTP ${response.status}`);
        args.callbacks.onError?.(errorText || `HTTP ${response.status}`);
        return;
    }

    if (!response.body) {
        args.callbacks.onError?.('No response body');
        return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');

            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim() || line.startsWith(':')) continue;

                if (line.startsWith('data: ')) {
                    const jsonStr = line.slice(6);
                    if (!jsonStr || jsonStr === '{}') continue;

                    try {
                        const event = JSON.parse(jsonStr) as ThinkSSEEvent;

                        switch (event.type) {
                            case 'activity':
                                args.callbacks.onActivity?.(event.data);
                                break;
                            case 'status':
                                args.callbacks.onStatus?.(event.data);
                                break;
                            case 'done':
                                args.callbacks.onDone?.(event.data.thought, event.data.urgent);
                                break;
                            case 'error':
                                args.callbacks.onError?.(event.data);
                                break;
                        }
                    } catch {
                        console.error('Failed to parse SSE event:', jsonStr);
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}
