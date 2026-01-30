import { db, isDbConnected } from '../db/index.js';
import { Model } from './base.js';

export interface WorkspaceData {
    id: number;
    name: string;
    path: string;
    detected_from: string | null;
    last_accessed: Date;
    created_at: Date;
}

export class Workspace extends Model<WorkspaceData> implements WorkspaceData {
    name!: string;
    path!: string;
    detected_from!: string | null;
    last_accessed!: Date;
    created_at!: Date;

    static override tableName = 'workspaces';

    static async getByPath(path: string): Promise<Workspace | null> {
        if (!isDbConnected()) return null;

        const { rows } = await db.query(`SELECT * FROM workspaces WHERE path = $1`, [path]);

        return rows[0] ? new Workspace(rows[0]) : null;
    }

    static async upsert(path: string, name: string, detectedFrom: string): Promise<Workspace> {
        if (!isDbConnected()) throw new Error('Database not connected');

        const existing = await Workspace.getByPath(path);

        if (existing) {
            await existing.update({ last_accessed: new Date() });
            return existing;
        }

        return Workspace.create({
            name,
            path,
            detected_from: detectedFrom,
            last_accessed: new Date(),
        });
    }
}
