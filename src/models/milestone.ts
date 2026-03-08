import { db, isDbConnected } from '../db/index.js';
import { Model } from './base.js';

export type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

export interface MilestoneData {
    id: number;
    goal_id: number;
    title: string;
    description: string;
    status: MilestoneStatus;
    order_index: number; // Position in the goal sequence
    dependencies: number[]; // Other milestone IDs this depends on
    deadline?: Date;
    completed_at?: Date;
    created_at: Date;
    updated_at?: Date;
}

export class Milestone extends Model<MilestoneData> implements MilestoneData {
    declare goal_id: number;
    declare title: string;
    declare description: string;
    declare status: MilestoneStatus;
    declare order_index: number;
    declare dependencies: number[];
    declare deadline?: Date;
    declare completed_at?: Date;
    declare created_at: Date;
    declare updated_at?: Date;

    static override tableName = 'milestones';

    static async getById(id: number): Promise<Milestone | null> {
        return Milestone.get(id);
    }

    static async getByGoal(goalId: number): Promise<Milestone[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM milestones WHERE goal_id = $1 ORDER BY order_index ASC`,
            [goalId],
        );

        return rows.map((row) => new Milestone(row));
    }

    static async getPendingForGoal(goalId: number): Promise<Milestone[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM milestones 
             WHERE goal_id = $1 AND status IN ('pending', 'in_progress', 'blocked')
             ORDER BY order_index ASC`,
            [goalId],
        );

        return rows.map((row) => new Milestone(row));
    }

    static async getBlocked(): Promise<Milestone[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT m.*, g.title as goal_title 
             FROM milestones m
             JOIN goals g ON m.goal_id = g.id
             WHERE m.status = 'blocked' AND g.status = 'active'
             ORDER BY g.priority ASC, m.order_index ASC`,
        );

        return rows.map((row) => new Milestone(row));
    }

    async start(): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(
            `UPDATE milestones SET status = 'in_progress', updated_at = NOW() WHERE id = $1`,
            [this.id],
        );
        this.status = 'in_progress';
    }

    async complete(): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(
            `UPDATE milestones SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [this.id],
        );
        this.status = 'completed';
        this.completed_at = new Date();
    }

    async block(): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(
            `UPDATE milestones SET status = 'blocked', updated_at = NOW() WHERE id = $1`,
            [this.id],
        );
        this.status = 'blocked';
    }

    async unblock(): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(
            `UPDATE milestones SET status = 'pending', updated_at = NOW() WHERE id = $1`,
            [this.id],
        );
        this.status = 'pending';
    }

    async addDependency(milestoneId: number): Promise<void> {
        if (!isDbConnected()) return;

        const deps = [...this.dependencies, milestoneId];
        await db.query(
            `UPDATE milestones SET dependencies = $1, updated_at = NOW() WHERE id = $2`,
            [deps, this.id],
        );
        this.dependencies = deps;
    }

    async checkDependencies(): Promise<{ met: boolean; blocking: number[] }> {
        if (!isDbConnected() || this.dependencies.length === 0) {
            return { met: true, blocking: [] };
        }

        const { rows } = await db.query(
            `SELECT id FROM milestones 
             WHERE id = ANY($1) AND status != 'completed'`,
            [this.dependencies],
        );

        const blocking = rows.map((r) => r.id);
        return { met: blocking.length === 0, blocking };
    }

    async getGoal(): Promise<{ id: number; title: string } | null> {
        if (!isDbConnected()) return null;

        const { rows } = await db.query(`SELECT id, title FROM goals WHERE id = $1`, [
            this.goal_id,
        ]);

        return rows[0] || null;
    }
}
