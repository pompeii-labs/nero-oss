import { tool, toolparam } from '@pompeii-labs/magma/decorators';
import type { MagmaToolCall } from '@pompeii-labs/magma/types';
import type { MagmaAgent } from '@pompeii-labs/magma';
import { Project } from '../../models/project';
import { ProjectTask, type TaskKind } from '../../models/project-task';
import { Settings } from '../../models/settings';
import { waitForApproval } from './approval';
import { launchProject } from './runner';
import { Args } from '../../util/args';

const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

interface PlanTask {
    title: string;
    description: string;
    dependsOn: number[];
    tools: string[];
    kind: TaskKind;
    estCostUsd: number;
}

function parseTasks(raw: unknown): PlanTask[] | string {
    let parsed: unknown;
    try {
        parsed = JSON.parse(String(raw ?? '[]'));
    } catch {
        return 'tasks must be valid JSON.';
    }
    if (!Array.isArray(parsed)) return 'tasks must be a JSON array.';
    const out: PlanTask[] = parsed.map((t) => {
        const o = (t ?? {}) as Record<string, unknown>;
        const deps = Array.isArray(o.depends_on) ? o.depends_on : [];
        const tls = Array.isArray(o.tools) ? o.tools : [];
        const k = String(o.kind ?? 'research');
        return {
            title: String(o.title ?? '').trim(),
            description: String(o.description ?? '').trim(),
            dependsOn: deps.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0),
            tools: tls.map((x) => String(x)),
            kind: k === 'code' || k === 'verify' ? (k as TaskKind) : 'research',
            estCostUsd: Number(o.est_cost_usd) || 0,
        };
    });
    if (out.length === 0) return 'Provide at least one task.';
    if (out.some((t) => !t.title || !t.description))
        return 'Every task needs a title and a description.';
    // Dependencies must reference earlier task indices only (a DAG, no cycles).
    for (let i = 0; i < out.length; i++) {
        if (out[i].dependsOn.some((d) => d >= out.length))
            return `Task ${i} depends on a task index that does not exist.`;
        if (out[i].dependsOn.some((d) => d >= i))
            return `Task ${i} depends on a later task - dependencies must point to earlier tasks only.`;
    }
    return out;
}

/** Nero's project tools: break a substantial goal into a task DAG, get the plan +
 *  budget approved, then run it in the background with a fleet of agents. */
export class ProjectUtility {
    @tool({
        name: 'plan_project',
        description:
            "Take on a substantial, multi-step goal as a background PROJECT instead of doing it inline. Break it into a DAG of tasks (each run by its own agent, in parallel where possible); this presents the plan + an estimated budget to the user and BLOCKS until they approve. Nothing runs or spends until they hit Run. On approval the project executes in the background and you're notified when done - so use this for work that's too big for one turn (research + synthesis, multi-part builds, anything you'd 'go off and work on'), not for quick answers. After it returns, relay the outcome (running / needs changes / cancelled).",
    })
    @toolparam({
        key: 'title',
        type: 'string',
        required: true,
        description:
            'A short, descriptive title naming the project (a few words), required. Name what it delivers, e.g. "via:// namespace" - never a placeholder like "Untitled".',
    })
    @toolparam({
        key: 'goal',
        type: 'string',
        required: true,
        description: 'The overall outcome the project should deliver, in one or two sentences.',
    })
    @toolparam({
        key: 'tasks',
        type: 'string',
        required: true,
        description:
            'JSON array of tasks, in dependency order. Each: {"title":"...", "description":"full instructions for the agent doing this task", "depends_on":[earlier task indices], "tools":["optional hints"], "kind":"research"|"code", "est_cost_usd":0.20}. depends_on must reference EARLIER indices only (it is a DAG). Independent tasks run in parallel. Use "kind":"code" for tasks that write/modify code in the repo (they run in an isolated git worktree and produce a diff); default is "research". IMPORTANT for code work: every task (code AND research) runs in a worktree with the FULL repo checked out, so each task can read whatever files it needs on its own. Do NOT add a separate task just to "read/understand the whole codebase", that wastes tokens; each code task explores the code it touches. The final task should synthesize/assemble if needed.',
    })
    @toolparam({
        key: 'repo',
        type: 'string',
        required: false,
        description:
            'Absolute path to the target git repo, REQUIRED when any task is kind "code". Its work integrates onto a fresh branch; nothing is pushed without the user opening a PR. Defaults to the code_repo_path setting if unset.',
    })
    async plan_project(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const a = new Args(call);
        const title = a.text('title');
        if (!title) return 'Provide a short, descriptive title for the project (a few words).';
        const goal = a.text('goal');
        if (!goal) return 'Provide a goal for the project.';
        const parsed = parseTasks(call.fn_args.tasks);
        if (typeof parsed === 'string') return parsed;

        // A code project needs a repo, and a verify step to prove it builds.
        const hasCode = parsed.some((t) => t.kind === 'code');
        let repoPath: string | null = null;
        if (hasCode) {
            repoPath = a.text('repo') || (await Settings.get('code_repo_path'));
            if (!repoPath)
                return 'This plan writes code, so it needs a target repo: pass the "repo" parameter (an absolute path to a git repo) or set the code_repo_path setting first.';
            if (!parsed.some((t) => t.kind === 'verify')) {
                const codeIdx = parsed.flatMap((t, i) => (t.kind === 'code' ? [i] : []));
                parsed.push({
                    title: 'Verify build and tests',
                    description:
                        'Run the build and test suite for this repo. If anything fails, fix the code and re-run until it passes or you have tried 3 times. Report exactly what you ran and the final result.',
                    dependsOn: codeIdx,
                    tools: [],
                    kind: 'verify',
                    estCostUsd: 0.2,
                });
            }
        }

        const estTotal = parsed.reduce((s, t) => s + t.estCostUsd, 0);
        const project = await Project.create({
            title,
            goal,
            model: (await Settings.resolveConnection('plan_model')).model,
            est_cost_usd: estTotal,
            status: 'awaiting_approval',
            repo_path: repoPath,
        });
        for (let i = 0; i < parsed.length; i++) {
            const t = parsed[i];
            await ProjectTask.create({
                project_id: project.id,
                idx: i,
                title: t.title,
                description: t.description,
                depends_on: t.dependsOn,
                tools: t.tools,
                kind: t.kind,
                status: 'pending',
            });
        }

        const res = await waitForApproval(project.id, APPROVAL_TIMEOUT_MS);

        if (res.kind === 'run') {
            await launchProject(project.id, res.budgetUsd);
            return `Approved. "${title}" is running in the background (${parsed.length} tasks, budget $${res.budgetUsd.toFixed(2)}). I'll let you know when it's done.`;
        }
        if (res.kind === 'tweak') {
            await Project.update(project.id, { status: 'cancelled' });
            return `The user wants changes before running: "${res.note}". Revise the plan accordingly and call plan_project again.`;
        }
        if (res.kind === 'timeout') {
            await Project.update(project.id, { status: 'cancelled' });
            return 'The user did not approve the plan in time. Hold off; mention they can ask again when ready.';
        }
        await Project.update(project.id, { status: 'cancelled' });
        return 'The user cancelled the project. Do not run it.';
    }

    @tool({
        name: 'project_status',
        description:
            'Check on background projects - their status, progress, and spend. Pass a project id for one, or omit it to list active projects.',
    })
    @toolparam({
        key: 'id',
        type: 'string',
        required: false,
        description: 'A project id to inspect. Omit to list running/paused/awaiting projects.',
    })
    async project_status(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const a = new Args(call);
        const id = a.text('id');
        if (id) {
            const p = await Project.get(id);
            if (!p) return 'No project with that id.';
            const ts = await ProjectTask.listByProject(id);
            const lines = ts.map(
                (t) =>
                    `  ${t.idx}. [${t.status}] ${t.title}${t.cost_usd ? ` ($${t.cost_usd.toFixed(3)})` : ''}`,
            );
            return `${p.title}: ${p.status}, spent $${p.spent_usd.toFixed(3)}${p.budget_usd ? `/$${p.budget_usd.toFixed(2)}` : ''}\n${lines.join('\n')}${p.result ? `\n\nResult:\n${p.result}` : ''}`;
        }
        const active = await Project.listByStatus('awaiting_approval', 'running', 'paused');
        if (active.length === 0) return 'No active projects.';
        return active
            .map(
                (p) =>
                    `- ${p.title} (${p.id.slice(0, 8)}): ${p.status}, spent $${p.spent_usd.toFixed(3)}${p.budget_usd ? `/$${p.budget_usd.toFixed(2)}` : ''}`,
            )
            .join('\n');
    }

    @tool({
        name: 'cancel_project',
        description: 'Cancel a running or pending project. In-flight tasks stop being scheduled.',
    })
    @toolparam({
        key: 'id',
        type: 'string',
        required: true,
        description: 'The project id to cancel.',
    })
    async cancel_project(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const a = new Args(call);
        const id = a.text('id');
        const p = await Project.get(id);
        if (!p) return 'No project with that id.';
        if (p.status === 'done' || p.status === 'cancelled')
            return `Project is already ${p.status}.`;
        await Project.update(id, { status: 'cancelled' });
        return `Cancelled "${p.title}".`;
    }
}
