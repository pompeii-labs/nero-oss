import { getServerUrl, buildServerResponse, type ServerResponse } from './helpers';

export type Memory = {
    id: number;
    body: string;
    created_at: string;
};

export async function getMemories(): Promise<ServerResponse<Memory[]>> {
    try {
        const response = await fetch(getServerUrl('/memories'));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return buildServerResponse({ data });
    } catch (e) {
        return buildServerResponse({ error: (e as Error).message });
    }
}

export async function createMemory(body: string): Promise<ServerResponse<Memory>> {
    try {
        const response = await fetch(getServerUrl('/memories'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return buildServerResponse({ data });
    } catch (e) {
        return buildServerResponse({ error: (e as Error).message });
    }
}

export async function deleteMemory(id: number): Promise<ServerResponse<void>> {
    try {
        const response = await fetch(getServerUrl(`/memories/${id}`), {
            method: 'DELETE',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return buildServerResponse({ data: undefined });
    } catch (e) {
        return buildServerResponse({ error: (e as Error).message });
    }
}
