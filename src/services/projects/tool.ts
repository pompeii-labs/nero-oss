import { tool, toolparam } from '@pompeii-labs/magma/decorators';
import type { MagmaToolCall } from '@pompeii-labs/magma/types';
import type { MagmaAgent } from '@pompeii-labs/magma';
import { loadConfig } from '../../config';
import { Project } from '../../models/project';
import { ProjectTask } from '../../models/project-task';
import { waitForApproval } from './approval';
import { launchProject } from './runner';
import { Args } from '../../util/args';

const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

const workerModel = () => process.env.NERO_WORKER_MODEL || loadConfig().model;

interface PlanTask {
    title: string;
    description: string;
    dependsOn: number[];
    tools: string[];
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
        return {
            title: String(o.title ?? '').trim(),
            description: String(o.description ?? '').trim(),
            dependsOn: deps.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0),
            tools: tls.map((x) => String(x)),
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
        description: 'A short title for the project (a few words).',
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
            'JSON array of tasks, in dependency order. Each: {"title":"...", "description":"full instructions for the agent doing this task", "depends_on":[earlier task indices], "tools":["optional hints"], "est_cost_usd":0.20}. depends_on must reference EARLIER indices only (it is a DAG). Independent tasks run in parallel. The final task should synthesize/assemble if needed.',
    })
    async plan_project(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const a = new Args(call);
        const title = a.text('title') || 'Untitled project';
        const goal = a.text('goal');
        if (!goal) return 'Provide a goal for the project.';
        const parsed = parseTasks(call.fn_args.tasks);
        if (typeof parsed === 'string') return parsed;

        const estTotal = parsed.reduce((s, t) => s + t.estCostUsd, 0);
        const project = await Project.create({
            title,
            goal,
            model: workerModel(),
            est_cost_usd: estTotal,
            status: 'awaiting_approval',
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
