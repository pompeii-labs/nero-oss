import { db, isDbConnected } from '../db/index.js';
import { Model } from './base.js';

export type GoalStatus = 'active' | 'paused' | 'completed' | 'abandoned';

export interface GoalData {
    id: number;
    title: string;
    description: string;
    status: GoalStatus;
    priority: number; // 1-5, lower is higher priority
    deadline?: Date;
    current_milestone: number;
    total_milestones: number;
    autonomy_project_id?: number; // Link to existing autonomy project
    tags: string[];
    created_at: Date;
    updated_at?: Date;
}

export class Goal extends Model<GoalData> implements GoalData {
    declare title: string;
    declare description: string;
    declare status: GoalStatus;
    declare priority: number;
    declare deadline?: Date;
    declare current_milestone: number;
    declare total_milestones: number;
    declare autonomy_project_id?: number;
    declare tags: string[];
    declare created_at: Date;
    declare updated_at?: Date;

    static override tableName = 'goals';

    static async getById(id: number): Promise<Goal | null> {
        return Goal.get(id);
    }

    static async getActive(): Promise<Goal[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM goals WHERE status = 'active' ORDER BY priority ASC, deadline ASC NULLS LAST, created_at DESC`,
        );

        return rows.map((row) => new Goal(row));
    }

    static async getByStatus(status: GoalStatus): Promise<Goal[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM goals WHERE status = $1 ORDER BY priority ASC, deadline ASC NULLS LAST`,
            [status],
        );

        return rows.map((row) => new Goal(row));
    }

    static async getByTag(tag: string): Promise<Goal[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM goals WHERE $1 = ANY(tags) AND status = 'active' ORDER BY priority ASC`,
            [tag],
        );

        return rows.map((row) => new Goal(row));
    }

    static async getOverdue(): Promise<Goal[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM goals 
             WHERE status = 'active' 
             AND deadline < NOW() 
             ORDER BY deadline ASC`,
        );

        return rows.map((row) => new Goal(row));
    }

    static async getDueSoon(days: number = 7): Promise<Goal[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM goals 
             WHERE status = 'active' 
             AND deadline BETWEEN NOW() AND NOW() + INTERVAL '${days} days'
             ORDER BY deadline ASC`,
        );

        return rows.map((row) => new Goal(row));
    }

    async updateProgress(currentMilestone: number): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(
            `UPDATE goals SET current_milestone = $1, updated_at = NOW() WHERE id = $2`,
            [currentMilestone, this.id],
        );
        this.current_milestone = currentMilestone;
    }

    async complete(): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(
            `UPDATE goals SET status = 'completed', current_milestone = total_milestones, updated_at = NOW() WHERE id = $1`,
            [this.id],
        );
        this.status = 'completed';
        this.current_milestone = this.total_milestones;
    }

    async abandon(): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(`UPDATE goals SET status = 'abandoned', updated_at = NOW() WHERE id = $1`, [
            this.id,
        ]);
        this.status = 'abandoned';
    }

    async pause(): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(`UPDATE goals SET status = 'paused', updated_at = NOW() WHERE id = $1`, [
            this.id,
        ]);
        this.status = 'paused';
    }

    async resume(): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(`UPDATE goals SET status = 'active', updated_at = NOW() WHERE id = $1`, [
            this.id,
        ]);
        this.status = 'active';
    }

    get progress(): number {
        if (this.total_milestones === 0) return 0;
        return Math.round((this.current_milestone / this.total_milestones) * 100);
    }

    get isOverdue(): boolean {
        if (!this.deadline) return false;
        return new Date() > this.deadline;
    }

    get daysUntilDeadline(): number | null {
        if (!this.deadline) return null;
        const diff = new Date(this.deadline).getTime() - Date.now();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }
}
