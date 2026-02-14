import { db, isDbConnected } from '../db/index.js';
import { Model } from './base.js';

export interface AutonomyProjectData {
    id: number;
    title: string;
    description: string;
    status: string;
    priority: number;
    progress_notes: string[];
    next_step: string | null;
    total_sessions: number;
    created_at: Date;
    updated_at: Date;
}

export class AutonomyProject extends Model<AutonomyProjectData> implements AutonomyProjectData {
    declare title: string;
    declare description: string;
    declare status: string;
    declare priority: number;
    declare progress_notes: string[];
    declare next_step: string | null;
    declare total_sessions: number;
    declare created_at: Date;
    declare updated_at: Date;

    static override tableName = 'autonomy_projects';

    static async getActive(): Promise<AutonomyProject[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM autonomy_projects WHERE status = 'active' ORDER BY priority ASC, updated_at DESC`,
        );

        return rows.map((row) => new AutonomyProject(row));
    }

    static async getByStatus(status: string): Promise<AutonomyProject[]> {
        return AutonomyProject.list({
            where: { status } as Partial<AutonomyProjectData>,
            orderBy: { column: 'priority', direction: 'ASC' },
        });
    }

    async addProgressNote(note: string): Promise<void> {
        if (!isDbConnected()) return;

        const timestamped = `[${new Date().toISOString()}] ${note}`;
        await db.query(
            `UPDATE autonomy_projects SET progress_notes = array_append(progress_notes, $1), updated_at = NOW() WHERE id = $2`,
            [timestamped, this.id],
        );
        this.progress_notes = [...this.progress_notes, timestamped];
    }

    async incrementSessions(): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(
            `UPDATE autonomy_projects SET total_sessions = total_sessions + 1, updated_at = NOW() WHERE id = $1`,
            [this.id],
        );
        this.total_sessions += 1;
    }
}
