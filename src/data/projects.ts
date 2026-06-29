import { getLux, unwrap } from '../lux/client';
import type { Projects } from '../lux/types';

export type ProjectStatus =
    | 'planning'
    | 'awaiting_approval'
    | 'running'
    | 'paused'
    | 'done'
    | 'error'
    | 'cancelled';

export interface Project {
    id: string;
    title: string;
    goal: string;
    status: ProjectStatus;
    budgetUsd: number;
    spentUsd: number;
    estCostUsd: number;
    model: string;
    deviceId: string | null;
    parentDispatchId: string | null;
    result: string | null;
    error: string | null;
    createdAt: number;
    updatedAt: number;
}

function coerce(r: Projects): Project {
    return {
        id: r.id,
        title: r.title ?? '',
        goal: r.goal ?? '',
        status: (r.status as ProjectStatus) ?? 'planning',
        budgetUsd: r.budget_usd ?? 0,
        spentUsd: r.spent_usd ?? 0,
        estCostUsd: r.est_cost_usd ?? 0,
        model: r.model ?? '',
        deviceId: r.device_id ?? null,
        parentDispatchId: r.parent_dispatch_id ?? null,
        result: r.result ?? null,
        error: r.error ?? null,
        createdAt: r.created_at ?? 0,
        updatedAt: r.updated_at ?? 0,
    };
}

export interface CreateInput {
    title: string;
    goal: string;
    model: string;
    estCostUsd?: number;
    deviceId?: string | null;
    parentDispatchId?: string | null;
}

export async function create(input: CreateInput): Promise<Project> {
    const res = await getLux()
        .table('projects')
        .insert({
            title: input.title,
            goal: input.goal,
            model: input.model,
            est_cost_usd: input.estCostUsd ?? 0,
            device_id: input.deviceId ?? null,
            parent_dispatch_id: input.parentDispatchId ?? null,
            status: 'awaiting_approval',
        } as never);
    return coerce(unwrap(res) as Projects);
}

export type ProjectPatch = Partial<
    Pick<Project, 'title' | 'status' | 'budgetUsd' | 'spentUsd' | 'estCostUsd' | 'result' | 'error'>
>;

const COL: Record<keyof ProjectPatch, string> = {
    title: 'title',
    status: 'status',
    budgetUsd: 'budget_usd',
    spentUsd: 'spent_usd',
    estCostUsd: 'est_cost_usd',
    result: 'result',
    error: 'error',
};

export async function update(id: string, patch: ProjectPatch): Promise<void> {
    const body: Record<string, unknown> = { updated_at: Date.now() };
    for (const [k, v] of Object.entries(patch)) body[COL[k as keyof ProjectPatch]] = v;
    unwrap(
        await getLux()
            .table('projects')
            .update(body as never)
            .eq('id', id),
    );
}

/** Atomically add to spend (read-modify-write; single-process so no contention). */
export async function addSpend(id: string, deltaUsd: number): Promise<number> {
    const p = await get(id);
    const next = (p?.spentUsd ?? 0) + deltaUsd;
    await update(id, { spentUsd: next });
    return next;
}

export async function get(id: string): Promise<Project | null> {
    const rows = unwrap(
        await getLux().table('projects').select().eq('id', id).limit(1),
    ) as Projects[];
    return rows.length ? coerce(rows[0]) : null;
}

export async function listByStatus(...statuses: ProjectStatus[]): Promise<Project[]> {
    const rows = unwrap(
        await getLux().table('projects').select().in('status', statuses).limit(200),
    ) as Projects[];
    return rows.map(coerce);
}
