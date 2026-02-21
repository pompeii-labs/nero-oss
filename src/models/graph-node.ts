import { db, isDbConnected } from '../db/index.js';
import { Model } from './base.js';

export interface GraphNodeData {
    id: number;
    type: string;
    label: string;
    body: string | null;
    embedding: number[] | null;
    strength: number;
    access_count: number;
    last_accessed: Date;
    category: string | null;
    metadata: Record<string, any>;
    memory_id: number | null;
    created_at: Date;
}

export class GraphNode extends Model<GraphNodeData> implements GraphNodeData {
    declare type: string;
    declare label: string;
    declare body: string | null;
    declare embedding: number[] | null;
    declare strength: number;
    declare access_count: number;
    declare last_accessed: Date;
    declare category: string | null;
    declare metadata: Record<string, any>;
    declare memory_id: number | null;
    declare created_at: Date;

    static override tableName = 'graph_nodes';

    static async findSimilar(embedding: number[], limit: number = 5): Promise<GraphNode[]> {
        if (!isDbConnected()) return [];

        const vectorStr = `[${embedding.join(',')}]`;
        const { rows } = await db.query(
            `SELECT *, (embedding <=> $1::vector) AS distance
             FROM graph_nodes
             WHERE embedding IS NOT NULL
             ORDER BY embedding <=> $1::vector
             LIMIT $2`,
            [vectorStr, limit],
        );

        return rows.map((row) => new GraphNode(row));
    }

    static async findSimilarWithScore(
        embedding: number[],
        limit: number = 5,
    ): Promise<Array<{ node: GraphNode; similarity: number }>> {
        if (!isDbConnected()) return [];

        const vectorStr = `[${embedding.join(',')}]`;
        const { rows } = await db.query(
            `SELECT *, 1 - (embedding <=> $1::vector) AS similarity
             FROM graph_nodes
             WHERE embedding IS NOT NULL
             ORDER BY embedding <=> $1::vector
             LIMIT $2`,
            [vectorStr, limit],
        );

        return rows.map((row) => ({
            node: new GraphNode(row),
            similarity: parseFloat(row.similarity),
        }));
    }

    static async findByLabel(label: string, type?: string): Promise<GraphNode | null> {
        if (!isDbConnected()) return null;

        const query = type
            ? `SELECT * FROM graph_nodes WHERE LOWER(label) = LOWER($1) AND type = $2 LIMIT 1`
            : `SELECT * FROM graph_nodes WHERE LOWER(label) = LOWER($1) LIMIT 1`;
        const params = type ? [label, type] : [label];

        const { rows } = await db.query(query, params);
        return rows[0] ? new GraphNode(rows[0]) : null;
    }

    static async getCore(): Promise<GraphNode[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM graph_nodes
             WHERE category = 'core'
             ORDER BY created_at DESC`,
        );

        return rows.map((row) => new GraphNode(row));
    }

    static async touch(id: number): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(
            `UPDATE graph_nodes
             SET access_count = access_count + 1,
                 last_accessed = NOW(),
                 strength = LEAST(strength + 0.05, 2.0)
             WHERE id = $1`,
            [id],
        );
    }

    static async decayAll(): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(
            `UPDATE graph_nodes
             SET strength = GREATEST(strength * 0.995, 0.01)
             WHERE category != 'core'
             AND last_accessed < NOW() - INTERVAL '1 hour'`,
        );
    }

    static async createWithEmbedding(
        fields: Omit<GraphNodeData, 'id' | 'created_at' | 'access_count' | 'last_accessed'>,
    ): Promise<GraphNode> {
        if (!isDbConnected()) throw new Error('Database not connected');

        const vectorStr = fields.embedding ? `[${fields.embedding.join(',')}]` : null;
        const { rows } = await db.query(
            `INSERT INTO graph_nodes (type, label, body, embedding, strength, category, metadata, memory_id)
             VALUES ($1, $2, $3, $4::vector, $5, $6, $7, $8)
             RETURNING *`,
            [
                fields.type,
                fields.label,
                fields.body,
                vectorStr,
                fields.strength ?? 1.0,
                fields.category,
                JSON.stringify(fields.metadata ?? {}),
                fields.memory_id,
            ],
        );

        return new GraphNode(rows[0]);
    }

    static async getAll(): Promise<GraphNode[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT id, type, label, body, strength, access_count, last_accessed, category, metadata, memory_id, created_at
             FROM graph_nodes
             ORDER BY strength DESC`,
        );

        return rows.map((row) => new GraphNode(row));
    }
}
