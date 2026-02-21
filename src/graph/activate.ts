import chalk from 'chalk';
import { GraphNode } from '../models/graph-node.js';
import { GraphEdge } from '../models/graph-edge.js';
import { embed } from './embedding.js';

export interface ActivatedNode {
    id: number;
    type: string;
    label: string;
    body: string | null;
    category: string | null;
    strength: number;
    score: number;
    connections: string[];
}

interface ScoredNode {
    node: GraphNode;
    similarity: number;
    graphActivation: number;
    recency: number;
    connections: string[];
}

export async function activate(
    query: string,
    options?: { topK?: number; maxHops?: number },
): Promise<ActivatedNode[]> {
    const topK = options?.topK ?? 20;
    const maxHops = options?.maxHops ?? 3;

    let queryEmbedding: number[];
    try {
        queryEmbedding = await embed(query);
    } catch (error) {
        console.error(chalk.dim(`[graph] Embedding failed, falling back to core nodes only`));
        const coreNodes = await GraphNode.getCore();
        return coreNodes.map((n) => ({
            id: n.id,
            type: n.type,
            label: n.label,
            body: n.body,
            category: n.category,
            strength: n.strength,
            score: 1.0,
            connections: [],
        }));
    }

    const seeds = await GraphNode.findSimilarWithScore(queryEmbedding, 5);
    if (seeds.length === 0) {
        const coreNodes = await GraphNode.getCore();
        return coreNodes.map((n) => ({
            id: n.id,
            type: n.type,
            label: n.label,
            body: n.body,
            category: n.category,
            strength: n.strength,
            score: 1.0,
            connections: [],
        }));
    }

    const activationMap = new Map<number, number>();
    const nodeMap = new Map<number, GraphNode>();
    const connectionsMap = new Map<number, string[]>();

    for (const { node, similarity } of seeds) {
        activationMap.set(node.id, similarity);
        nodeMap.set(node.id, node);
        connectionsMap.set(node.id, []);
    }

    const visited = new Set<number>();
    let frontier = seeds.map((s) => ({ id: s.node.id, activation: s.similarity }));

    for (let hop = 0; hop < maxHops; hop++) {
        const nextFrontier: Array<{ id: number; activation: number }> = [];
        const decayFactor = Math.pow(0.5, hop + 1);

        for (const { id, activation } of frontier) {
            if (visited.has(id)) continue;
            visited.add(id);

            const [outEdges, inEdges] = await Promise.all([
                GraphEdge.getEdgesFrom(id),
                GraphEdge.getEdgesTo(id),
            ]);

            const processEdge = async (neighborId: number, weight: number, edgeLabel: string) => {
                const spread = activation * decayFactor * weight;
                const current = activationMap.get(neighborId) || 0;

                if (spread > current) {
                    activationMap.set(neighborId, spread);

                    if (!nodeMap.has(neighborId)) {
                        const neighbor = (await GraphNode.get(neighborId)) as GraphNode | null;
                        if (neighbor) nodeMap.set(neighborId, neighbor);
                    }

                    const sourceNode = nodeMap.get(id);
                    const conns = connectionsMap.get(neighborId) || [];
                    if (sourceNode) {
                        conns.push(`${sourceNode.type}:${sourceNode.label}`);
                    }
                    connectionsMap.set(neighborId, conns);
                }

                nextFrontier.push({ id: neighborId, activation: spread });
            };

            for (const edge of outEdges) {
                await processEdge(edge.target_id, edge.weight, edge.relation);
            }
            for (const edge of inEdges) {
                await processEdge(edge.source_id, edge.weight, edge.relation);
            }
        }

        frontier = nextFrontier.filter((f) => f.activation > 0.01);
        if (frontier.length === 0) break;
    }

    const now = Date.now();
    const scored: ScoredNode[] = [];

    for (const [id, graphActivation] of activationMap) {
        const node = nodeMap.get(id);
        if (!node) continue;

        const similarity = seeds.find((s) => s.node.id === id)?.similarity ?? 0;
        const ageMs = now - new Date(node.last_accessed).getTime();
        const ageHours = ageMs / (1000 * 60 * 60);
        const recency = 1 / (1 + ageHours / 24);

        scored.push({
            node,
            similarity,
            graphActivation,
            recency,
            connections: connectionsMap.get(id) || [],
        });
    }

    scored.sort((a, b) => {
        const scoreA = a.similarity * 0.6 + a.graphActivation * 0.3 + a.recency * 0.1;
        const scoreB = b.similarity * 0.6 + b.graphActivation * 0.3 + b.recency * 0.1;
        return scoreB - scoreA;
    });

    const coreNodes = await GraphNode.getCore();
    const resultIds = new Set<number>();
    const results: ActivatedNode[] = [];

    for (const core of coreNodes) {
        resultIds.add(core.id);
        const existing = scored.find((s) => s.node.id === core.id);
        results.push({
            id: core.id,
            type: core.type,
            label: core.label,
            body: core.body,
            category: core.category,
            strength: core.strength,
            score: existing
                ? existing.similarity * 0.6 +
                  existing.graphActivation * 0.3 +
                  existing.recency * 0.1
                : 1.0,
            connections: existing?.connections || [],
        });
    }

    for (const s of scored.slice(0, topK)) {
        if (resultIds.has(s.node.id)) continue;
        resultIds.add(s.node.id);

        results.push({
            id: s.node.id,
            type: s.node.type,
            label: s.node.label,
            body: s.node.body,
            category: s.node.category,
            strength: s.node.strength,
            score: s.similarity * 0.6 + s.graphActivation * 0.3 + s.recency * 0.1,
            connections: s.connections,
        });
    }

    const touchPromises = results.slice(0, 10).map((r) => GraphNode.touch(r.id));
    await Promise.all(touchPromises);

    const activatedIds = results.map((r) => r.id);
    await strengthenCoActivated(activatedIds);

    return results;
}

async function strengthenCoActivated(nodeIds: number[]): Promise<void> {
    if (nodeIds.length < 2) return;

    try {
        const edges = await GraphEdge.getAll();
        const idSet = new Set(nodeIds);

        for (const edge of edges) {
            if (idSet.has(edge.source_id) && idSet.has(edge.target_id)) {
                await GraphEdge.strengthen(edge.id);
            }
        }
    } catch (error) {
        console.error(chalk.dim(`[graph] Co-activation strengthening failed`));
    }
}
