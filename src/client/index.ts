import { Logger } from '../util/logger.js';

export interface NeroClientConfig {
    baseUrl: string;
    timeout?: number;
}

export interface ChatResponse {
    content: string;
    streamed: boolean;
}

export interface ActivityEvent {
    tool: string;
    args: Record<string, unknown>;
    status: 'pending' | 'approved' | 'denied' | 'running' | 'complete' | 'error';
    result?: string;
    error?: string;
}

export type PermissionHandler = (id: string, activity: ActivityEvent) => void;

export class NeroClient {
    private baseUrl: string;
    private timeout: number;
    private logger = new Logger('Client');

    constructor(config: NeroClientConfig) {
        this.baseUrl = config.baseUrl.replace(/\/$/, '');
        this.timeout = config.timeout || 120000;
    }

    static async checkServiceRunning(baseUrl: string): Promise<boolean> {
        try {
            const response = await fetch(`${baseUrl}/health`, {
                signal: AbortSignal.timeout(2000),
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    async chat(
        message: string,
        onChunk?: (chunk: string) => void,
        onActivity?: (activity: ActivityEvent) => void,
        cwd?: string,
        onPermission?: PermissionHandler
    ): Promise<ChatResponse> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(`${this.baseUrl}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream',
                },
                body: JSON.stringify({ message, medium: 'cli', cwd }),
                signal: controller.signal,
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(error.error || `HTTP ${response.status}`);
            }

            const contentType = response.headers.get('content-type') || '';

            if (contentType.includes('text/event-stream')) {
                return this.handleSSEResponse(response, onChunk, onActivity, onPermission);
            } else {
                const data = await response.json();
                return { content: data.content, streamed: false };
            }
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private async handleSSEResponse(
        response: Response,
        onChunk?: (chunk: string) => void,
        onActivity?: (activity: ActivityEvent) => void,
        onPermission?: PermissionHandler
    ): Promise<ChatResponse> {
        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let fullContent = '';
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;

                const data = line.slice(6);
                if (data === '{}') continue;

                try {
                    const parsed = JSON.parse(data);

                    if (parsed.type === 'chunk' && parsed.data) {
                        fullContent += parsed.data;
                        onChunk?.(parsed.data);
                    } else if (parsed.type === 'activity' && parsed.data) {
                        onActivity?.(parsed.data as ActivityEvent);
                    } else if (parsed.type === 'permission' && parsed.id && parsed.data) {
                        onPermission?.(parsed.id, parsed.data as ActivityEvent);
                    } else if (parsed.type === 'done' && parsed.data?.content) {
                        fullContent = parsed.data.content;
                    } else if (parsed.type === 'error') {
                        throw new Error(parsed.data);
                    }
                } catch (e) {
                    if (e instanceof SyntaxError) continue;
                    throw e;
                }
            }
        }

        return { content: fullContent, streamed: true };
    }

    async getHealth(): Promise<{ status: string; agent: { contextUsage: number } }> {
        const response = await fetch(`${this.baseUrl}/health`);
        if (!response.ok) {
            throw new Error(`Health check failed: ${response.status}`);
        }
        return response.json();
    }

    async getContext(): Promise<{
        tokens: number;
        limit: number;
        percentage: number;
        mcpTools: string[];
    }> {
        const response = await fetch(`${this.baseUrl}/context`);
        if (!response.ok) {
            throw new Error(`Context request failed: ${response.status}`);
        }
        return response.json();
    }

    async getHistory(): Promise<{
        messages: Array<{ role: 'user' | 'assistant'; content: string; created_at: string }>;
        hasSummary: boolean;
    }> {
        const response = await fetch(`${this.baseUrl}/history`);
        if (!response.ok) {
            throw new Error(`History request failed: ${response.status}`);
        }
        return response.json();
    }

    async compact(): Promise<{ success: boolean; summary: string }> {
        const response = await fetch(`${this.baseUrl}/compact`, {
            method: 'POST',
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.error || `HTTP ${response.status}`);
        }
        return response.json();
    }

    async reload(): Promise<{ success: boolean; mcpTools: number }> {
        const response = await fetch(`${this.baseUrl}/reload`, {
            method: 'POST',
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.error || `HTTP ${response.status}`);
        }
        return response.json();
    }

    async respondToPermission(id: string, approved: boolean): Promise<void> {
        const response = await fetch(`${this.baseUrl}/permission/${id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approved }),
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.error || `HTTP ${response.status}`);
        }
    }
}
