import { get, getServerUrl, type NeroResult } from './helpers';

export interface LogEntry {
    timestamp: string;
    level: string;
    source: string;
    message: string;
    details?: object;
}

export interface LogsResponse {
    count: number;
    logFile: string | null;
    entries: LogEntry[];
}

export function getLogs(lines: number = 200, level?: string): Promise<NeroResult<LogsResponse>> {
    const params = new URLSearchParams();
    params.append('lines', String(lines));
    if (level) params.append('level', level);
    return get<LogsResponse>(`/api/logs?${params}`);
}

export function createLogStream(
    onEntry: (entry: LogEntry) => void,
    level?: string,
): { close: () => void } {
    const params = new URLSearchParams();
    if (level) params.append('level', level);

    const controller = new AbortController();
    let closed = false;

    (async () => {
        try {
            const response = await fetch(getServerUrl(`/api/logs/stream?${params}`), {
                signal: controller.signal,
            });
            if (!response.ok || !response.body) return;

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (!closed) {
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
                        const entry = JSON.parse(data) as LogEntry;
                        if (entry.timestamp) onEntry(entry);
                    } catch {}
                }
            }
        } catch {}
    })();

    return {
        close: () => {
            closed = true;
            controller.abort();
        },
    };
}
