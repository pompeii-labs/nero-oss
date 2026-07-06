import { DataModel } from './datamodel';

export type ProjectStatus =
    | 'planning'
    | 'awaiting_approval'
    | 'running'
    | 'paused'
    | 'done'
    | 'error'
    | 'cancelled';

/** A merge blocked on the user: the agent resolved it in the integration worktree
 *  and we hold the merge until they approve the resolution. */
export interface MergeConflict {
    task_idx: number;
    task_title: string;
    files: string[];
    /** The staged resolution diff shown in the approval card. */
    diff: string;
}

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
    /** Short synthesis in Nero's voice (the overview headline); set on finalize. */
    summary: string | null;
    error: string | null;
    dismissed: boolean;
    /** Set once the project touches code: the target repo + the branch its tasks
     *  integrate onto. Null for pure-research projects. */
    repo_path: string | null;
    base_branch: string | null;
    integration_branch: string | null;
    merge_conflict: MergeConflict | null;
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
    summary!: string | null;
    error!: string | null;
    dismissed!: boolean;
    repo_path!: string | null;
    base_branch!: string | null;
    integration_branch!: string | null;
    merge_conflict!: MergeConflict | null;
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
