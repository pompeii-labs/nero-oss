import { DataModel } from './datamodel';
import { getLux, unwrap } from '@nero/shared/lux';
import type { ProjectTasks } from '@nero/shared/types';

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'cancelled';
export type TaskKind = 'research' | 'code' | 'verify';

export interface TaskActivity {
    id: string;
    tool: string;
    displayName?: string;
    status: 'running' | 'success' | 'error';
    /** What the tool was called with (rendered in the step-page slideover). */
    args?: Record<string, unknown>;
    result?: string;
}

export interface ProjectTaskData {
    id: string;
    project_id: string;
    idx: number;
    title: string;
    description: string;
    depends_on: number[];
    tools: string[];
    /** research (text result) | code (produces a diff, runs in a worktree) | verify. */
    kind: TaskKind;
    status: TaskStatus;
    streaming_text: string;
    activities: TaskActivity[];
    result: string | null;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    job_id: string | null;
    /** Code tasks: the worktree branch, its final commit, the diff, the worktree path. */
    branch: string | null;
    commit_sha: string | null;
    diff: string | null;
    workdir: string | null;
    created_at: number;
    updated_at: number;
}

export class ProjectTask extends DataModel<ProjectTaskData> {
    static readonly tableName = 'project_tasks';
    static readonly stampUpdatedAt = true;

    project_id!: string;
    idx!: number;
    title!: string;
    description!: string;
    depends_on!: number[];
    tools!: string[];
    kind!: TaskKind;
    status!: TaskStatus;
    streaming_text!: string;
    activities!: TaskActivity[];
    result!: string | null;
    input_tokens!: number;
    output_tokens!: number;
    cost_usd!: number;
    job_id!: string | null;
    branch!: string | null;
    commit_sha!: string | null;
    diff!: string | null;
    workdir!: string | null;
    created_at!: number;
    updated_at!: number;

    constructor(data: ProjectTaskData) {
        super();
        Object.assign(this, data);
    }

    static async listByProject(projectId: string): Promise<ProjectTask[]> {
        const rows = unwrap(
            await getLux()
                .table('project_tasks')
                .select()
                .eq('project_id', projectId)
                .order('idx', { ascending: true })
                .limit(500),
        ) as ProjectTasks[];
        return rows.map((r) => new ProjectTask(r as unknown as ProjectTaskData));
    }
}
