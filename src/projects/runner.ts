import { NeroAgent } from '../harness/agent';
import { buildWorkerUtilities } from '../tools';
import { recallForPrompt } from '../memory/memory';
import { notify } from '../mediums/registry';
import { loadConfig } from '../config';
import { pool } from './pool';
import { costUsd } from './pricing';
import * as projects from '../data/projects';
import * as tasks from '../data/project-tasks';
import type { ProjectTask, TaskActivity } from '../data/project-tasks';
import type { AgentActivity } from '../harness/activity';

const workerModel = () => process.env.NERO_WORKER_MODEL || loadConfig().model;

/** How many times to retry a task that throws before failing the whole project. */
const TASK_ATTEMPTS = 2;

/** Wall-clock ceiling for a single task agent. A hung tool loop fails the task
 *  instead of stalling the whole project forever. */
const TASK_TIMEOUT_MS = Number(process.env.NERO_TASK_TIMEOUT_MS) || 8 * 60_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(label)), ms);
        p.then(
            (v) => {
                clearTimeout(timer);
                resolve(v);
            },
            (e) => {
                clearTimeout(timer);
                reject(e);
            },
        );
    });
}

function taskPrompt(goal: string, task: ProjectTask, depBlock: string): string {
    return [
        'You are completing ONE task within a larger project. Do it fully using your tools.',
        '',
        `PROJECT GOAL: ${goal}`,
        '',
        `YOUR TASK: ${task.title}`,
        task.description,
        depBlock ? `\nRESULTS FROM EARLIER TASKS YOU CAN BUILD ON:\n${depBlock}` : '',
        '',
        'When done, reply with the concrete result/output itself (not a status update) — it is passed to later tasks and synthesized into the final deliverable.',
    ].join('\n');
}

/** Run one task as a headless agent: resolve dependency results, stream live state to
 *  the task row, meter spend, and schedule whatever the completion unblocks. */
async function runTask(projectId: string, taskId: string): Promise<void> {
    const project = await projects.get(projectId);
    const task = await tasks.get(taskId);
    if (!project || !task) return;
    if (project.status !== 'running') return; // paused/cancelled before we picked it up
    if (task.status === 'done') return;

    await tasks.update(taskId, { status: 'running' });

    const all = await tasks.listByProject(projectId);
    const depBlock = task.dependsOn
        .map((idx) => all.find((t) => t.idx === idx))
        .filter((t): t is ProjectTask => !!t)
        .map((d) => `### ${d.title}\n${d.result ?? '(no result)'}`)
        .join('\n\n');

    const model = workerModel();
    let streamed = '';
    const acts = new Map<string, TaskActivity>();
    const usage = { input: 0, output: 0 };

    let lastErr: unknown;
    for (let attempt = 1; attempt <= TASK_ATTEMPTS; attempt++) {
        streamed = '';
        acts.clear();
        const agent = new NeroAgent({ model, utilities: buildWorkerUtilities() });
        try {
            await agent.setup();
            let lastWrite = 0;
            const flush = async (force = false) => {
                const now = Date.now();
                if (!force && now - lastWrite < 400) return;
                lastWrite = now;
                await tasks
                    .update(taskId, { streamingText: streamed, activities: [...acts.values()] })
                    .catch(() => {});
            };
            agent.onDelta = (t) => {
                streamed += t;
                void flush();
            };
            agent.onActivity = (a: AgentActivity) => {
                acts.set(a.id, {
                    id: a.id,
                    tool: a.details.fn_name,
                    displayName: a.details.display_name,
                    status: a.status,
                    result:
                        typeof a.details.result === 'string'
                            ? a.details.result.slice(0, 200)
                            : undefined,
                });
                void flush();
            };
            agent.onUsage = (u) => {
                usage.input += u.input;
                usage.output += u.output;
            };
            agent.currentMemories = await recallForPrompt(task.description).catch(() => '');

            agent.addMessage({ role: 'user', content: taskPrompt(project.goal, task, depBlock) });
            const res = await withTimeout(
                agent.main(),
                TASK_TIMEOUT_MS,
                `task timed out after ${Math.round(TASK_TIMEOUT_MS / 1000)}s`,
            );
            agent.endRun();
            const out = res?.content ?? '';

            const cost = await costUsd(model, usage.input, usage.output);
            await tasks.update(taskId, {
                status: 'done',
                result: out,
                streamingText: streamed,
                activities: [...acts.values()],
                inputTokens: usage.input,
                outputTokens: usage.output,
                costUsd: cost,
            });
            const spent = await projects.addSpend(projectId, cost);

            // Budget ceiling: pause the project and ping the user. No more tasks schedule
            // while paused (scheduleReady gates on status === 'running').
            if (project.budgetUsd > 0 && spent >= project.budgetUsd) {
                await projects.update(projectId, { status: 'paused' });
                await notify({
                    title: `Project paused: ${project.title}`,
                    body: `Hit the $${project.budgetUsd.toFixed(2)} budget (spent $${spent.toFixed(2)}). Resume or raise the budget to continue.`,
                    urgency: 'normal',
                }).catch(() => {});
                return;
            }

            await scheduleReady(projectId);
            return;
        } catch (err) {
            agent.endRun();
            lastErr = err;
        }
    }

    // Out of attempts -> the task (and project) failed.
    const msg = lastErr instanceof Error ? lastErr.message : 'task failed';
    await tasks.update(taskId, { status: 'failed', result: msg });
    await projects.update(projectId, { status: 'error', error: msg });
}

/** Schedule every pending task whose dependencies are all done; finalize when the
 *  whole DAG is complete. Idempotent (the pool dedups by task id). */
export async function scheduleReady(projectId: string): Promise<void> {
    const project = await projects.get(projectId);
    if (!project || project.status !== 'running') return;
    const all = await tasks.listByProject(projectId);
    if (all.some((t) => t.status === 'failed')) {
        await projects.update(projectId, { status: 'error', error: 'a task failed' });
        return;
    }
    if (all.length > 0 && all.every((t) => t.status === 'done')) {
        await finalizeProject(projectId, all);
        return;
    }
    const doneIdx = new Set(all.filter((t) => t.status === 'done').map((t) => t.idx));
    for (const t of all) {
        if (t.status !== 'pending') continue;
        if (t.dependsOn.every((d) => doneIdx.has(d))) {
            pool.submit(t.id, () => runTask(projectId, t.id));
        }
    }
}

/** Synthesize task results into the final deliverable, mark done, notify. */
async function finalizeProject(projectId: string, all: ProjectTask[]): Promise<void> {
    const project = await projects.get(projectId);
    if (!project) return;
    const model = workerModel();
    // Synthesis just composes the deliverable from task results into project.result
    // (which the dashboard renders) — no tools, so it returns text rather than
    // wandering off to write a file.
    const agent = new NeroAgent({ model, utilities: [] });
    await agent.setup();
    const usage = { input: 0, output: 0 };
    agent.onUsage = (u) => {
        usage.input += u.input;
        usage.output += u.output;
    };
    const body = all.map((t) => `## ${t.title}\n${t.result ?? ''}`).join('\n\n');
    agent.addMessage({
        role: 'user',
        content: `Assemble the final deliverable for this project from the completed task results below.\n\nPROJECT GOAL: ${project.goal}\n\nTASK RESULTS:\n${body}\n\nProduce the complete deliverable the user asked for — polished and self-contained.`,
    });
    const res = await agent.main();
    agent.endRun();
    const out = res?.content ?? '';
    const cost = await costUsd(model, usage.input, usage.output);
    const spent = await projects.addSpend(projectId, cost);
    await projects.update(projectId, { status: 'done', result: out });
    await notify({
        title: `Project done: ${project.title}`,
        body: `${project.goal} — finished (${all.length} tasks, ~$${spent.toFixed(2)}).`,
        urgency: 'normal',
    }).catch(() => {});
}

/** Approve + launch: set running, schedule ready tasks into the pool. */
export async function launchProject(projectId: string, budgetUsd: number): Promise<void> {
    await projects.update(projectId, { status: 'running', budgetUsd });
    await scheduleReady(projectId);
}

/** On boot: interrupted projects resume; abandoned approvals are cancelled. */
export async function resumeProjects(): Promise<number> {
    let n = 0;
    for (const p of await projects.listByStatus('awaiting_approval')) {
        await projects.update(p.id, { status: 'cancelled' }); // waiter died with the process
        n++;
    }
    for (const p of await projects.listByStatus('running')) {
        // Tasks caught mid-run when we died restart cleanly.
        for (const t of await tasks.listByProject(p.id)) {
            if (t.status === 'running') await tasks.update(t.id, { status: 'pending' });
        }
        await scheduleReady(p.id);
        n++;
    }
    return n;
}
