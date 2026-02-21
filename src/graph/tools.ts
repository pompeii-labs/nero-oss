import { db, isDbConnected } from '../db/index.js';
import { GraphNode } from '../models/graph-node.js';

export async function trackToolUse(toolName: string): Promise<void> {
    if (!isDbConnected()) return;

    try {
        const existing = await GraphNode.findByLabel(toolName, 'tool');
        if (existing) {
            await GraphNode.touch(existing.id);
        } else {
            await db.query(
                `INSERT INTO graph_nodes (type, label, body, strength, category, metadata)
                 VALUES ('tool', $1, NULL, 1.0, NULL, '{}')`,
                [toolName],
            );
        }
    } catch {}
}
