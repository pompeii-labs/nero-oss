import { db, isDbConnected } from '../db/index.js';
import { Model } from './base.js';

export interface GraphEdgeData {
    id: number;
    source_id: number;
    target_id: number;
    relation: string;
    weight: number;
    created_at: Date;
}

export class GraphEdge extends Model<GraphEdgeData> implements GraphEdgeData {
    declare source_id: number;
    declare target_id: number;
    declare relation: string;
    declare weight: number;
    declare created_at: Date;

    static override tableName = 'graph_edges';

    static async getEdgesFrom(nodeId: number): Promise<GraphEdge[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(`SELECT * FROM graph_edges WHERE source_id = $1`, [nodeId]);

        return rows.map((row) => new GraphEdge(row));
    }

    static async getEdgesTo(nodeId: number): Promise<GraphEdge[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(`SELECT * FROM graph_edges WHERE target_id = $1`, [nodeId]);

        return rows.map((row) => new GraphEdge(row));
    }

    static async strengthen(id: number): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(`UPDATE graph_edges SET weight = LEAST(weight + 0.05, 3.0) WHERE id = $1`, [
            id,
        ]);
    }

    static async getAll(): Promise<GraphEdge[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(`SELECT * FROM graph_edges ORDER BY weight DESC`);

        return rows.map((row) => new GraphEdge(row));
    }

    static async upsert(sourceId: number, targetId: number, relation: string): Promise<GraphEdge> {
        if (!isDbConnected()) throw new Error('Database not connected');

        const { rows } = await db.query(
            `INSERT INTO graph_edges (source_id, target_id, relation)
             VALUES ($1, $2, $3)
             ON CONFLICT (source_id, target_id, relation)
             DO UPDATE SET weight = LEAST(graph_edges.weight + 0.1, 3.0)
             RETURNING *`,
            [sourceId, targetId, relation],
        );

        return new GraphEdge(rows[0]);
    }
}
