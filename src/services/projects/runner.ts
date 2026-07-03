import { Worker, type Job } from 'bullmq';
import { NeroAgent } from '../harness/agent';
import { buildWorkerUtilities } from '../../tools';
import { Memory } from '../../models/memory';
import { Mediums } from '../mediums/registry';
import { loadConfig } from '../../config';
import { getQueue, luxRedis, projectConcurrency, PROJECT_QUEUE } from '../../lib/queue';
import { Pricing } from './pricing';
import { Logger } from '../../lib/logger';
import { Project } from '../../models/project';
import { ProjectTask, type TaskActivity } from '../../models/project-task';
import { Message } from '../../models/message';
import type { AgentActivity } from '../harness/activity';

const log = new Logger('projects');

const workerModel = () => process.env.NERO_WORKER_MODEL || loadConfig().model;

/** Wall-clock ceiling for a single task agent. A hung tool loop fails the task
 *  instead of stalling the whole project forever. */
const TASK_TIMEOUT_MS = Number(process.env.NERO_TASK_TIMEOUT_MS) || 8 * 60_000;

/** On boot we only auto-resume a `running` project if it was touched recently. An
 *  orphaned/stuck project (nothing wrote to it in this window) is marked errored
 *  instead of re-run, so it can't silently re-spend on every restart. */
const PROJECT_STALE_MS = Number(process.env.NERO_PROJECT_STALE_MS) || 30 * 60_000;

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
        'When done, reply with the concrete result/output itself (not a status update). It is passed to later tasks and synthesized into the final deliverable.',
    ].join('\n');
}

let worker: Worker | null = null;

/** Start the (singleton) BullMQ worker that runs project tasks as headless agents. */
export function startProjectWorker(): Worker {
    if (worker) return worker;
    worker = new Worker(PROJECT_QUEUE, processJob, {
        connection: luxRedis(),
        concurrency: projectConcurrency(),
    });
    worker.on('failed', async (job, err) => {
        const { projectId, taskId } = (job?.data ?? {}) as { projectId?: string; taskId?: string };
        log.error('task failed', { taskId, error: err?.message });
        if (taskId)
            await ProjectTask.update(taskId, {
                status: 'failed',
                result: err?.message ?? 'failed',
            });
        if (projectId)
            await Project.update(projectId, {
                status: 'error',
                error: err?.message ?? 'task failed',
            });
    });
    return worker;
}

/** Process one task job: resolve dependency results, run a headless agent, stream
 *  live state to the task row, meter spend, and schedule whatever it unblocks. */
async function processJob(job: Job): Promise<void> {
    const { projectId, taskId } = job.data as { projectId: string; taskId: string };
    const project = await Project.get(projectId);
    const task = await ProjectTask.get(taskId);
    if (!project || !task) return;
    if (project.status !== 'running') return; // paused/cancelled before we picked it up
    if (task.status === 'done') return;

    await ProjectTask.update(taskId, { status: 'running', job_id: String(job.id ?? '') });

    const all = await ProjectTask.listByProject(projectId);
    const depBlock = task.depends_on
        .map((idx) => all.find((t) => t.idx === idx))
        .filter((t): t is ProjectTask => !!t)
        .map((d) => `### ${d.title}\n${d.result ?? '(no result)'}`)
        .join('\n\n');

    const model = workerModel();
    let streamed = '';
    const acts = new Map<string, TaskActivity>();
    const usage = { input: 0, output: 0 };

    const agent = new NeroAgent({ model, utilities: buildWorkerUtilities() });
    await agent.setup();
    let lastWrite = 0;
    const flush = async () => {
        const now = Date.now();
        if (now - lastWrite < 400) return;
        lastWrite = now;
        await ProjectTask.update(taskId, {
            streaming_text: streamed,
            activities: [...acts.values()],
        }).catch(() => {});
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
            args: a.details.args,
            result:
                typeof a.details.result === 'string' ? a.details.result.slice(0, 4000) : undefined,
        });
        void flush();
    };
    agent.onUsage = (u) => {
        usage.input += u.input;
        usage.output += u.output;
    };
    agent.currentMemories = await Memory.recallForPrompt(task.description).catch(() => '');

    agent.addMessage({ role: 'user', content: taskPrompt(project.goal, task, depBlock) });
    const res = await withTimeout(
        agent.main(),
        TASK_TIMEOUT_MS,
        `task timed out after ${Math.round(TASK_TIMEOUT_MS / 1000)}s`,
    );
    agent.endRun();
    const out = res?.content ?? '';

    const cost = await Pricing.costUsd(model, usage.input, usage.output);
    await ProjectTask.update(taskId, {
        status: 'done',
        result: out,
        streaming_text: streamed,
        activities: [...acts.values()],
        input_tokens: usage.input,
        output_tokens: usage.output,
        cost_usd: cost,
    });
    const spent = await Project.addSpend(projectId, cost);

    // Budget ceiling: pause the project + queue, ping the user. Resume re-opens both.
    if (project.budget_usd > 0 && spent >= project.budget_usd) {
        await Project.update(projectId, { status: 'paused' });
        await getQueue()
            .pause()
            .catch(() => {});
        await Mediums.notify({
            title: `Project paused: ${project.title}`,
            body: `Hit the $${project.budget_usd.toFixed(2)} budget (spent $${spent.toFixed(2)}). Resume or raise the budget to continue.`,
            urgency: 'normal',
        }).catch(() => {});
        return;
    }

    await scheduleReady(projectId);
}

/** Enqueue every pending task whose dependencies are all done; finalize when the
 *  whole DAG is complete. Idempotent (jobId = task id dedups re-enqueues). */
export async function scheduleReady(projectId: string): Promise<void> {
    const project = await Project.get(projectId);
    if (!project || project.status !== 'running') return;
    const all = await ProjectTask.listByProject(projectId);
    if (all.some((t) => t.status === 'failed')) {
        await Project.update(projectId, { status: 'error', error: 'a task failed' });
        return;
    }
    if (all.length > 0 && all.every((t) => t.status === 'done')) {
        await finalizeProject(projectId, all);
        return;
    }
    const doneIdx = new Set(all.filter((t) => t.status === 'done').map((t) => t.idx));
    const q = getQueue();
    for (const t of all) {
        if (t.status !== 'pending') continue;
        if (t.depends_on.every((d) => doneIdx.has(d))) {
            await q.add(
                'task',
                { projectId, taskId: t.id },
                { jobId: t.id, attempts: 2, backoff: { type: 'exponential', delay: 2000 } },
            );
        }
    }
}

/** Synthesize task results into the final deliverable, mark done, notify. */
async function finalizeProject(projectId: string, all: ProjectTask[]): Promise<void> {
    const project = await Project.get(projectId);
    if (!project || project.status !== 'running') return; // idempotent: only finalize once
    // The deliverable is the final task's output. Nero's plans end with an
    // assembly/synthesis task, so no extra LLM pass here, which keeps finalize
    // instant (can't hang) and avoids double-spending on a redundant synthesis.
    // Fallback (no clear final task): concatenate every task's result.
    const ordered = [...all].sort((a, b) => a.idx - b.idx);
    const last = ordered.at(-1);
    const result =
        last?.result?.trim() || ordered.map((t) => `## ${t.title}\n${t.result ?? ''}`).join('\n\n');
    await Project.update(projectId, { status: 'done', result });
    await Mediums.notify({
        title: `Project done: ${project.title}`,
        body: `${project.goal}. Finished (${all.length} tasks, ~$${(project.spent_usd ?? 0).toFixed(2)}).`,
        urgency: 'normal',
    }).catch(() => {});

    // Surface it in the chat as a message from Nero (not a silent status flip), and
    // it lands in his transcript so he can talk about it. The full doc opens from the
    // link; he can also pull details on demand with project_status.
    const n = all.length;
    const link = `The full write-up is ready: [open it →](/projects/${projectId})`;
    // Canned fallback; upgraded below to a short takeaway in Nero's voice (best-effort,
    // after the project is already marked done so this can never wedge it).
    let content = `Wrapped up **${project.title}** — ${n} ${n === 1 ? 'task' : 'tasks'}, about $${(project.spent_usd ?? 0).toFixed(2)}. ${link}`;
    try {
        const model = process.env.NERO_ANNOUNCE_MODEL || 'anthropic/claude-haiku-4.5';
        const agent = new NeroAgent({ model, utilities: [] });
        await agent.setup();
        const usage = { input: 0, output: 0 };
        agent.onUsage = (u) => {
            usage.input += u.input;
            usage.output += u.output;
        };
        agent.addMessage({
            role: 'user',
            content: `A background project you ran just finished. Write a SHORT message to the user in your own voice (2-3 sentences, no preamble, no "here's a message") telling them it's done and the single most useful takeaway from the deliverable. Do not use em-dashes. Then, on a new line, add exactly this and nothing else: ${link}\n\nPROJECT: ${project.title}\nGOAL: ${project.goal}\n\nDELIVERABLE:\n${result.slice(0, 12000)}`,
        });
        const res = await withTimeout(agent.main(), 45_000, 'announce timed out');
        agent.endRun();
        const text = res?.content?.trim();
        if (text) content = text;
        await Project.addSpend(projectId, await Pricing.costUsd(model, usage.input, usage.output));
    } catch {
        /* keep the canned fallback */
    }
    await Message.insert({ role: 'assistant', type: 'agent_text', content }).catch(() => {});
}

/** Approve + launch: set running, ensure the worker + queue, schedule ready tasks. */
export async function launchProject(projectId: string, budgetUsd: number): Promise<void> {
    await Project.update(projectId, { status: 'running', budget_usd: budgetUsd });
    startProjectWorker();
    await getQueue()
        .resume()
        .catch(() => {});
    await scheduleReady(projectId);
}

/** On boot: interrupted projects resume; abandoned approvals are cancelled. */
export async function resumeProjects(): Promise<number> {
    let n = 0;
    for (const p of await Project.listByStatus('awaiting_approval')) {
        await Project.update(p.id, { status: 'cancelled' }); // waiter died with the process
        n++;
    }
    const running = await Project.listByStatus('running');
    const fresh: typeof running = [];
    for (const p of running) {
        if (Date.now() - p.updated_at > PROJECT_STALE_MS) {
            // Orphaned/stuck: do NOT re-run (it would re-spend on every boot).
            await Project.update(p.id, {
                status: 'error',
                error: 'stale on boot; not auto-resumed',
            });
            log.warn('skipped stale project on boot', { id: p.id, title: p.title });
            n++;
        } else {
            fresh.push(p);
        }
    }
    if (fresh.length) startProjectWorker();
    for (const p of fresh) {
        // Tasks caught mid-run when we died restart cleanly.
        for (const t of await ProjectTask.listByProject(p.id)) {
            if (t.status === 'running') await ProjectTask.update(t.id, { status: 'pending' });
        }
        await scheduleReady(p.id);
        n++;
    }
    return n;
}

/** Graceful shutdown: close the worker + queue connections. */
export async function stopProjectWorker(): Promise<void> {
    await worker?.close().catch(() => {});
    worker = null;
}
