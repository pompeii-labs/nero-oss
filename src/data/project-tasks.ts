import { getLux, unwrap } from '../lux/client';
import type { ProjectTasks } from '../lux/types';

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'cancelled';

export interface TaskActivity {
    id: string;
    tool: string;
    displayName?: string;
    status: 'running' | 'success' | 'error';
    result?: string;
}

export interface ProjectTask {
    id: string;
    projectId: string;
    idx: number;
    title: string;
    description: string;
    dependsOn: number[];
    tools: string[];
    status: TaskStatus;
    streamingText: string;
    activities: TaskActivity[];
    result: string | null;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    jobId: string | null;
    createdAt: number;
    updatedAt: number;
}

function coerce(r: ProjectTasks): ProjectTask {
    return {
        id: r.id,
        projectId: r.project_id ?? '',
        idx: r.idx ?? 0,
        title: r.title ?? '',
        description: r.description ?? '',
        dependsOn: (r.depends_on as number[] | null) ?? [],
        tools: (r.tools as string[] | null) ?? [],
        status: (r.status as TaskStatus) ?? 'pending',
        streamingText: r.streaming_text ?? '',
        activities: (r.activities as TaskActivity[] | null) ?? [],
        result: r.result ?? null,
        inputTokens: r.input_tokens ?? 0,
        outputTokens: r.output_tokens ?? 0,
        costUsd: r.cost_usd ?? 0,
        jobId: r.job_id ?? null,
        createdAt: r.created_at ?? 0,
        updatedAt: r.updated_at ?? 0,
    };
}

export interface CreateTaskInput {
    projectId: string;
    idx: number;
    title: string;
    description: string;
    dependsOn: number[];
    tools: string[];
}

export async function create(input: CreateTaskInput): Promise<ProjectTask> {
    const res = await getLux()
        .table('project_tasks')
        .insert({
            project_id: input.projectId,
            idx: input.idx,
            title: input.title,
            description: input.description,
            depends_on: input.dependsOn,
            tools: input.tools,
            status: 'pending',
        } as never);
    return coerce(unwrap(res) as ProjectTasks);
}

export type TaskPatch = Partial<
    Pick<
        ProjectTask,
        | 'status'
        | 'streamingText'
        | 'activities'
        | 'result'
        | 'inputTokens'
        | 'outputTokens'
        | 'costUsd'
        | 'jobId'
    >
>;

const COL: Record<keyof TaskPatch, string> = {
    status: 'status',
    streamingText: 'streaming_text',
    activities: 'activities',
    result: 'result',
    inputTokens: 'input_tokens',
    outputTokens: 'output_tokens',
    costUsd: 'cost_usd',
    jobId: 'job_id',
};

export async function update(id: string, patch: TaskPatch): Promise<void> {
    const body: Record<string, unknown> = { updated_at: Date.now() };
    for (const [k, v] of Object.entries(patch)) body[COL[k as keyof TaskPatch]] = v;
    unwrap(
        await getLux()
            .table('project_tasks')
            .update(body as never)
            .eq('id', id),
    );
}

export async function get(id: string): Promise<ProjectTask | null> {
    const rows = unwrap(
        await getLux().table('project_tasks').select().eq('id', id).limit(1),
    ) as ProjectTasks[];
    return rows.length ? coerce(rows[0]) : null;
}

export async function listByProject(projectId: string): Promise<ProjectTask[]> {
    const rows = unwrap(
        await getLux()
            .table('project_tasks')
            .select()
            .eq('project_id', projectId)
            .order('idx', { ascending: true })
            .limit(500),
    ) as ProjectTasks[];
    return rows.map(coerce);
}
