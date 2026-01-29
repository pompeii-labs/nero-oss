import { getServerUrl } from './helpers';

export type ToolActivity = {
    id: string;
    tool: string;
    args: Record<string, unknown>;
    status: 'pending' | 'approved' | 'denied' | 'skipped' | 'running' | 'complete' | 'error';
    result?: string;
    error?: string;
    skipReason?: string;
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

export async function streamChat(args: {
    message: string;
    callbacks: StreamCallbacks;
    signal?: AbortSignal;
}): Promise<void> {
    const url = getServerUrl('/api/chat');

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
        },
        body: JSON.stringify({ message: args.message, medium: 'api' }),
        signal: args.signal,
    });

    if (!response.ok) {
        const errorText = await response.text();
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
    const url = getServerUrl(`/api/permission/${id}`);

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, alwaysAllow }),
    });

    return response.ok;
}

export async function addAlwaysAllowTool(tool: string): Promise<boolean> {
    const url = getServerUrl('/api/permissions/allow');

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool }),
    });

    return response.ok;
}

export async function getAllowedTools(): Promise<string[]> {
    const url = getServerUrl('/api/permissions');

    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json();
    return data.allowed || [];
}

export async function removeAllowedTool(tool: string): Promise<boolean> {
    const url = getServerUrl(`/api/permissions/allow/${encodeURIComponent(tool)}`);

    const response = await fetch(url, { method: 'DELETE' });

    return response.ok;
}

export async function compactContext(): Promise<{ success: boolean; summary?: string }> {
    const url = getServerUrl('/api/compact');

    const response = await fetch(url, { method: 'POST' });

    if (!response.ok) {
        return { success: false };
    }

    const data = await response.json();
    return { success: true, summary: data.summary };
}

export async function clearHistory(): Promise<{ success: boolean }> {
    const url = getServerUrl('/api/clear');

    const response = await fetch(url, { method: 'POST' });

    return { success: response.ok };
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
        const errorText = await response.text();
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
