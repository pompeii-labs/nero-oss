import { db, isDbConnected } from '../db/index.js';
import { Model } from './base.js';

export type TaskStatus = 'pending' | 'blocked' | 'in_progress' | 'completed' | 'skipped';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface TaskData {
    id: number;
    milestone_id: number;
    goal_id: number;
    title: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    blocked_by: number[]; // Task IDs that block this one
    estimated_hours?: number;
    actual_hours: number;
    autonomy_eligible: boolean; // Can Nero do this without asking?
    completed_at?: Date;
    created_at: Date;
    updated_at?: Date;
}

export class Task extends Model<TaskData> implements TaskData {
    declare milestone_id: number;
    declare goal_id: number;
    declare title: string;
    declare description: string;
    declare status: TaskStatus;
    declare priority: TaskPriority;
    declare blocked_by: number[];
    declare estimated_hours?: number;
    declare actual_hours: number;
    declare autonomy_eligible: boolean;
    declare completed_at?: Date;
    declare created_at: Date;
    declare updated_at?: Date;

    static override tableName = 'tasks';

    static async getById(id: number): Promise<Task | null> {
        return Task.get(id);
    }

    static async getByMilestone(milestoneId: number): Promise<Task[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM tasks WHERE milestone_id = $1 ORDER BY 
             CASE priority 
                WHEN 'urgent' THEN 1 
                WHEN 'high' THEN 2 
                WHEN 'medium' THEN 3 
                WHEN 'low' THEN 4 
             END,
             created_at ASC`,
            [milestoneId],
        );

        return rows.map((row) => new Task(row));
    }

    static async getByGoal(goalId: number): Promise<Task[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM tasks WHERE goal_id = $1 ORDER BY created_at DESC`,
            [goalId],
        );

        return rows.map((row) => new Task(row));
    }

    static async getAutonomyEligible(): Promise<Task[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT t.*, m.status as milestone_status, g.status as goal_status
             FROM tasks t
             JOIN milestones m ON t.milestone_id = m.id
             JOIN goals g ON t.goal_id = g.id
             WHERE t.autonomy_eligible = TRUE 
             AND t.status = 'pending'
             AND m.status IN ('pending', 'in_progress')
             AND g.status = 'active'
             ORDER BY 
             CASE t.priority 
                WHEN 'urgent' THEN 1 
                WHEN 'high' THEN 2 
                WHEN 'medium' THEN 3 
                WHEN 'low' THEN 4 
             END
             LIMIT 10`,
        );

        return rows.map((row) => new Task(row));
    }

    static async getBlocked(): Promise<Task[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT t.*, m.title as milestone_title, g.title as goal_title
             FROM tasks t
             JOIN milestones m ON t.milestone_id = m.id
             JOIN goals g ON t.goal_id = g.id
             WHERE t.status = 'blocked' AND g.status = 'active'
             ORDER BY g.priority ASC, t.created_at ASC`,
        );

        return rows.map((row) => new Task(row));
    }

    async start(): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(
            `UPDATE tasks SET status = 'in_progress', updated_at = NOW() WHERE id = $1`,
            [this.id],
        );
        this.status = 'in_progress';
    }

    async complete(): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(
            `UPDATE tasks SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [this.id],
        );
        this.status = 'completed';
        this.completed_at = new Date();
    }

    async block(): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(`UPDATE tasks SET status = 'blocked', updated_at = NOW() WHERE id = $1`, [
            this.id,
        ]);
        this.status = 'blocked';
    }

    async unblock(): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(`UPDATE tasks SET status = 'pending', updated_at = NOW() WHERE id = $1`, [
            this.id,
        ]);
        this.status = 'pending';
    }

    async skip(): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(`UPDATE tasks SET status = 'skipped', updated_at = NOW() WHERE id = $1`, [
            this.id,
        ]);
        this.status = 'skipped';
    }

    async addBlocker(taskId: number): Promise<void> {
        if (!isDbConnected()) return;

        const blockers = [...this.blocked_by, taskId];
        await db.query(`UPDATE tasks SET blocked_by = $1, updated_at = NOW() WHERE id = $2`, [
            blockers,
            this.id,
        ]);
        this.blocked_by = blockers;
    }

    async checkBlockers(): Promise<{ blocked: boolean; blockers: number[] }> {
        if (!isDbConnected() || this.blocked_by.length === 0) {
            return { blocked: false, blockers: [] };
        }

        const { rows } = await db.query(
            `SELECT id FROM tasks 
             WHERE id = ANY($1) AND status != 'completed' AND status != 'skipped'`,
            [this.blocked_by],
        );

        const blockers = rows.map((r) => r.id);
        return { blocked: blockers.length > 0, blockers };
    }

    async trackTime(hours: number): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(
            `UPDATE tasks SET actual_hours = actual_hours + $1, updated_at = NOW() WHERE id = $2`,
            [hours, this.id],
        );
        this.actual_hours += hours;
    }

    get isOverdue(): boolean {
        // Task is overdue if it's been in progress for more than 3x estimated hours
        if (!this.estimated_hours || this.status !== 'in_progress') return false;
        return this.actual_hours > this.estimated_hours * 3;
    }

    get efficiency(): number | null {
        if (!this.estimated_hours || this.actual_hours === 0) return null;
        return Math.round((this.estimated_hours / this.actual_hours) * 100);
    }
}
