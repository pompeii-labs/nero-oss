import { get, del, type NeroResult } from './helpers';

export type GraphNode = {
    id: number;
    type: string;
    label: string;
    body: string | null;
    strength: number;
    category: string | null;
    access_count: number;
    last_accessed: string | null;
    created_at: string;
};

export type GraphEdge = {
    id: number;
    source: number;
    target: number;
    relation: string;
    weight: number;
};

export type GraphData = {
    nodes: GraphNode[];
    edges: GraphEdge[];
};

export function getGraph(): Promise<NeroResult<GraphData>> {
    return get<GraphData>('/api/graph');
}

export function deleteGraphNode(id: number): Promise<NeroResult<{ success: boolean }>> {
    return del<{ success: boolean }>(`/api/graph/nodes/${id}`);
}
