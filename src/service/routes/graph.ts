import { Router, Request, Response } from 'express';
import { GraphNode } from '../../models/graph-node.js';
import { GraphEdge } from '../../models/graph-edge.js';
import { activate } from '../../graph/activate.js';
import { embed } from '../../graph/embedding.js';
import { isDbConnected } from '../../db/index.js';

export function createGraphRouter() {
    const router = Router();

    router.get('/graph', async (req: Request, res: Response) => {
        if (!isDbConnected()) {
            res.status(503).json({ error: 'Database not connected' });
            return;
        }

        try {
            const nodes = await GraphNode.getAll();
            const edges = await GraphEdge.getAll();

            res.json({
                nodes: nodes.map((n) => ({
                    id: n.id,
                    type: n.type,
                    label: n.label,
                    body: n.body,
                    strength: n.strength,
                    category: n.category,
                    access_count: n.access_count,
                    last_accessed: n.last_accessed,
                    created_at: n.created_at,
                })),
                edges: edges.map((e) => ({
                    id: e.id,
                    source: e.source_id,
                    target: e.target_id,
                    relation: e.relation,
                    weight: e.weight,
                })),
            });
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    });

    router.get('/graph/activate', async (req: Request, res: Response) => {
        if (!isDbConnected()) {
            res.status(503).json({ error: 'Database not connected' });
            return;
        }

        const query = req.query.query as string;
        if (!query) {
            res.status(400).json({ error: 'query parameter required' });
            return;
        }

        try {
            const results = await activate(query, {
                topK: parseInt(String(req.query.topK || '20')) || 20,
                maxHops: parseInt(String(req.query.maxHops || '3')) || 3,
            });

            res.json({ nodes: results });
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    });

    router.post('/graph/nodes', async (req: Request, res: Response) => {
        if (!isDbConnected()) {
            res.status(503).json({ error: 'Database not connected' });
            return;
        }

        const { type, label, body, category } = req.body;
        if (!type || !label) {
            res.status(400).json({ error: 'type and label are required' });
            return;
        }

        try {
            const textToEmbed = `${label}: ${body || label}`;
            const embedding = await embed(textToEmbed);

            const node = await GraphNode.createWithEmbedding({
                type,
                label,
                body: body || null,
                embedding,
                strength: 1.0,
                category: category || null,
                metadata: {},
                memory_id: null,
            });

            res.status(201).json({
                id: node.id,
                type: node.type,
                label: node.label,
                body: node.body,
                strength: node.strength,
                category: node.category,
            });
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    });

    router.delete('/graph/nodes/:id', async (req: Request, res: Response) => {
        if (!isDbConnected()) {
            res.status(503).json({ error: 'Database not connected' });
            return;
        }

        const id = parseInt(String(req.params.id));
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid node ID' });
            return;
        }

        try {
            const node = (await GraphNode.get(id)) as GraphNode | null;
            if (!node) {
                res.status(404).json({ error: 'Node not found' });
                return;
            }

            await node.delete();
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    });

    return router;
}
