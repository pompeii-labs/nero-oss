import { get, post, del, type NeroResult } from './helpers';

export type Memory = {
    id: number;
    body: string;
    created_at: string;
};

export function getMemories(): Promise<NeroResult<Memory[]>> {
    return get('/api/memories');
}

export function createMemory(body: string): Promise<NeroResult<Memory>> {
    return post('/api/memories', { body });
}

export function deleteMemory(id: number): Promise<NeroResult<void>> {
    return del(`/api/memories/${id}`);
}
