import { post } from './helpers';

/** Approve a project's plan and launch it with a budget ceiling. */
export function runProject(id: string, budgetUsd: number): Promise<unknown> {
    return post(`/v1/projects/${id}/approve`, { action: 'run', budgetUsd });
}

/** Ask Nero to revise the plan before running. */
export function tweakProject(id: string, note: string): Promise<unknown> {
    return post(`/v1/projects/${id}/approve`, { action: 'tweak', note });
}

/** Reject the plan without running. */
export function rejectProject(id: string): Promise<unknown> {
    return post(`/v1/projects/${id}/approve`, { action: 'cancel' });
}

/** Pause a running project (in-flight tasks finish; none new are scheduled). */
export function pauseProject(id: string): Promise<unknown> {
    return post(`/v1/projects/${id}/pause`);
}

/** Resume a paused project (optionally raising the budget). */
export function resumeProject(id: string, budgetUsd?: number): Promise<unknown> {
    return post(`/v1/projects/${id}/resume`, budgetUsd ? { budgetUsd } : {});
}

/** Cancel a running or pending project. */
export function cancelProject(id: string): Promise<unknown> {
    return post(`/v1/projects/${id}/cancel`);
}
