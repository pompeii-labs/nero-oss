import { DataModel } from './datamodel';

export type ProjectStatus =
    | 'planning'
    | 'awaiting_approval'
    | 'running'
    | 'paused'
    | 'done'
    | 'error'
    | 'cancelled';

export interface ProjectData {
    id: string;
    title: string;
    goal: string;
    status: ProjectStatus;
    budget_usd: number;
    spent_usd: number;
    est_cost_usd: number;
    model: string;
    device_id: string | null;
    parent_dispatch_id: string | null;
    result: string | null;
    error: string | null;
    dismissed: boolean;
    created_at: number;
    updated_at: number;
}

export class Project extends DataModel<ProjectData> {
    static readonly tableName = 'projects';
    static readonly stampUpdatedAt = true;

    title!: string;
    goal!: string;
    status!: ProjectStatus;
    budget_usd!: number;
    spent_usd!: number;
    est_cost_usd!: number;
    model!: string;
    device_id!: string | null;
    parent_dispatch_id!: string | null;
    result!: string | null;
    error!: string | null;
    dismissed!: boolean;
    created_at!: number;
    updated_at!: number;

    constructor(data: ProjectData) {
        super();
        Object.assign(this, data);
    }

    static listByStatus(...statuses: ProjectStatus[]): Promise<Project[]> {
        return Project.list({ column: 'status', operator: 'in', value: statuses });
    }

    /** Atomically add to spend (fresh read-modify-write; safe under parallel workers). */
    static async addSpend(id: string, deltaUsd: number): Promise<number> {
        const p = await Project.get(id);
        const next = (p?.spent_usd ?? 0) + deltaUsd;
        await Project.update(id, { spent_usd: next });
        return next;
    }
}
