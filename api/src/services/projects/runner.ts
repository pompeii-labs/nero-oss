import { Worker, type Job } from 'bullmq';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { runner } from '@nero/shared/runner';
import { NeroAgent } from '../harness/agent';
import {
    isGitRepo,
    currentBranch,
    headSha,
    createBranch,
    addWorktree,
    addWorktreeNewBranch,
    addWorktreeDetached,
    removeWorktree,
    deleteBranch,
    commitAll,
    mergeBranch,
    commitMerge,
    abortMerge,
    stagedDiff,
    diffStat,
    fullDiff,
} from './git';
import { waitForMergeApproval } from './approval';
import { buildWorkerUtilities } from '../../tools';
import { Memory } from '../../models/memory';
import { Mediums } from '../mediums/registry';
import { loadConfig } from '@nero/shared/config';
import { getQueue, luxRedis, projectConcurrency, PROJECT_QUEUE } from '../../lib/queue';
import { Pricing } from './pricing';
import { Logger } from '@nero/shared/logger';
import { Project } from '../../models/project';
import { ProjectTask, type TaskActivity } from '../../models/project-task';
import { Message } from '../../models/message';
import type { AgentActivity } from '../harness/activity';

const log = new Logger('projects');

const workerModel = () => process.env.NERO_WORKER_MODEL || loadConfig().model;

/** Wall-clock ceiling for a single task agent. A hung tool loop fails the task
 *  instead of stalling the whole project forever. */
const TASK_TIMEOUT_MS = Number(process.env.NERO_TASK_TIMEOUT_MS) || 8 * 60_000;

/** Code/verify tasks run much longer: cargo/npm builds are slow and the agent
 *  iterates. The budget is the real ceiling; this is just a hang backstop. */
const CODE_TASK_TIMEOUT_MS = Number(process.env.NERO_CODE_TASK_TIMEOUT_MS) || 30 * 60_000;

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
        'Do NOT create summary, status, or "TASK_COMPLETE"-style files; just do the actual work and describe what you did in your reply.',
        'When done, reply with the concrete result/output itself (not a status update). It is passed to later tasks and synthesized into the final deliverable.',
    ].join('\n');
}

// --- Git integration: repo setup, worktree paths, serialized merges ---

const WORKTREES_ROOT = join(homedir(), '.nero', 'worktrees');
const integrationWorktree = (pid: string) => join(WORKTREES_ROOT, pid, '_integration');
const taskWorktree = (pid: string, tid: string) => join(WORKTREES_ROOT, pid, tid);
const taskBranchName = (pid: string, idx: number) => `nero/p${pid.slice(0, 8)}/t${idx}`;

const MERGE_APPROVAL_TIMEOUT_MS = 30 * 60_000;

const isCodeTask = (task: ProjectTask): boolean => task.kind === 'code' || task.kind === 'verify';

/** Cut the integration branch + its worktree the first time a project needs code.
 *  Idempotent: skips if already set up. */
async function setupRepo(project: Project): Promise<void> {
    const repo = project.repo_path;
    if (!repo || project.integration_branch) return;
    if (!(await isGitRepo(repo))) throw new Error(`${repo} is not a git repository`);
    const base = await currentBranch(repo);
    // Integration + task branches must be siblings under nero/p<id>/, not parent/child
    // (git refuses a ref `foo` alongside a ref `foo/bar`).
    const integ = `nero/p${project.id.slice(0, 8)}/integration`;
    await createBranch(repo, integ, base);
    const intWt = integrationWorktree(project.id);
    await runner().mkdir(dirname(intWt));
    await addWorktree(repo, intWt, integ);
    await Project.update(project.id, { base_branch: base, integration_branch: integ });
    project.base_branch = base;
    project.integration_branch = integ;
}

// Serialize merges per project (parallel task WORK is fine; the merges are not).
const mergeLocks = new Map<string, Promise<unknown>>();
function withMergeLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
    const run = () => fn();
    const prev = mergeLocks.get(projectId) ?? Promise.resolve();
    const next = prev.then(run, run);
    mergeLocks.set(
        projectId,
        next.then(
            () => {},
            () => {},
        ),
    );
    return next;
}

/** Merge a finished task's branch into the integration branch (under the per-project
 *  merge lock). On conflict, a resolve-agent stages a fix and the merge blocks on a
 *  user approval card. Returns false if the project should stop (rejected conflict). */
async function mergeTask(project: Project, task: ProjectTask, branch: string): Promise<boolean> {
    const repo = project.repo_path;
    if (!repo) return true;
    const intWt = integrationWorktree(project.id);
    const outcome = await mergeBranch(intWt, branch, `merge ${branch} (${task.title})`);
    if (outcome.clean) return true;

    await resolveConflictAgent(project, task, intWt, outcome.conflicts);
    const diff = await stagedDiff(intWt).catch(() => '');
    await Project.update(project.id, {
        merge_conflict: {
            task_idx: task.idx,
            task_title: task.title,
            files: outcome.conflicts,
            diff: diff.slice(0, 20_000),
        },
    });
    await Mediums.notify({
        title: `Merge needs review: ${project.title}`,
        body: `Task "${task.title}" conflicted (${outcome.conflicts.length} files). I staged a resolution, approve it to continue.`,
        urgency: 'normal',
    }).catch(() => {});

    const decision = await waitForMergeApproval(project.id, MERGE_APPROVAL_TIMEOUT_MS);
    await Project.update(project.id, { merge_conflict: null });
    if (decision === 'approve') {
        await commitMerge(intWt, `merge ${branch} (${task.title}) [conflict resolved]`);
        return true;
    }
    await abortMerge(intWt).catch(() => {});
    await Project.update(project.id, { status: 'paused' });
    await getQueue()
        .pause()
        .catch(() => {});
    return false;
}

/** One agent turn in the integration worktree, told to resolve the conflict markers
 *  and stage the result (not commit). */
async function resolveConflictAgent(
    project: Project,
    task: ProjectTask,
    intWt: string,
    files: string[],
): Promise<void> {
    const model = workerModel();
    const agent = new NeroAgent({ model, utilities: buildWorkerUtilities(intWt) });
    await agent.setup();
    const usage = { input: 0, output: 0 };
    agent.onUsage = (u) => {
        usage.input += u.input;
        usage.output += u.output;
    };
    agent.addMessage({
        role: 'user',
        content: [
            `A git merge of task "${task.title}" into the integration branch hit conflicts in:`,
            files.map((f) => `- ${f}`).join('\n'),
            '',
            'You are in the integration worktree. Resolve every conflict marker so the code is correct and keeps the intent of both sides, then `git add` the resolved files. Do NOT commit, just stage. Briefly say what you reconciled.',
        ].join('\n'),
    });
    await withTimeout(agent.main(), TASK_TIMEOUT_MS, 'conflict resolve timed out').catch(() => {});
    agent.endRun();
    await Project.addSpend(project.id, await Pricing.costUsd(model, usage.input, usage.output));
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
        // Pause (don't error) so siblings' merged work is preserved and the user can decide.
        if (projectId) {
            await Project.update(projectId, { status: 'paused' });
            await getQueue()
                .pause()
                .catch(() => {});
            await Mediums.notify({
                title: 'Project needs attention',
                body: `A task failed: ${err?.message ?? 'unknown error'}. Paused so nothing else runs; work done so far is kept.`,
                urgency: 'normal',
            }).catch(() => {});
        }
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

    // Each task works in its own directory so parallel workers never collide and
    // nothing leaks into the service cwd. In a repo project EVERY task gets a worktree
    // off the current integration HEAD (so it can read the code + already-merged deps);
    // code/verify tasks get a branch and commit+merge, research tasks get a detached
    // read-only worktree that is discarded. Non-repo projects get a plain scratch dir.
    const inRepo = !!project.integration_branch && !!project.repo_path;
    const willMerge = inRepo && isCodeTask(task);
    let workdir: string;
    let taskBranchRef: string | null = null;
    if (inRepo) {
        const repo = project.repo_path as string;
        workdir = taskWorktree(projectId, taskId);
        await runner().mkdir(join(WORKTREES_ROOT, projectId));
        // Idempotent: a retry/resume may leave a stale worktree or branch behind.
        await removeWorktree(repo, workdir).catch(() => {});
        const startPoint = await headSha(integrationWorktree(projectId));
        if (willMerge) {
            const branch = taskBranchName(projectId, task.idx);
            taskBranchRef = branch;
            await deleteBranch(repo, branch).catch(() => {});
            await addWorktreeNewBranch(repo, workdir, branch, startPoint);
            await ProjectTask.update(taskId, { workdir, branch });
        } else {
            await addWorktreeDetached(repo, workdir, startPoint);
            await ProjectTask.update(taskId, { workdir });
        }
    } else {
        workdir = join(homedir(), '.nero', 'work', projectId, taskId);
        await runner().mkdir(workdir);
    }
    const agent = new NeroAgent({ model, utilities: buildWorkerUtilities(workdir) });
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
    const timeoutMs = isCodeTask(task) ? CODE_TASK_TIMEOUT_MS : TASK_TIMEOUT_MS;
    let out = '';
    try {
        const res = await withTimeout(
            agent.main(),
            timeoutMs,
            `task timed out after ${Math.round(timeoutMs / 1000)}s`,
        );
        out = res?.content ?? '';
    } catch (e) {
        // A timeout is non-fatal: keep whatever the agent already did (its worktree +
        // the cost accrued so far) instead of throwing the task away. Real errors rethrow.
        if (!String((e as Error)?.message ?? e).includes('timed out')) throw e;
        log.warn('task hit its time limit; salvaging work so far', { taskId });
        out =
            streamed.trim() || '(this task hit its time limit; keeping the work completed so far)';
    } finally {
        agent.endRun();
    }

    const cost = await Pricing.costUsd(model, usage.input, usage.output);

    // Code/verify tasks: commit the worktree, then merge it into the integration branch.
    let commitSha: string | null = null;
    let taskDiff: string | null = null;
    if (willMerge && taskBranchRef) {
        const repo = project.repo_path as string;
        try {
            commitSha = await commitAll(workdir, `${task.title} (task #${task.idx + 1})`);
            if (commitSha)
                taskDiff = await fullDiff(repo, project.base_branch ?? 'HEAD', taskBranchRef).catch(
                    () => null,
                );
        } catch (e) {
            log.error('commit failed', { taskId, error: String(e) });
        }
    }

    await ProjectTask.update(taskId, {
        status: 'done',
        result: out,
        streaming_text: streamed,
        activities: [...acts.values()],
        input_tokens: usage.input,
        output_tokens: usage.output,
        cost_usd: cost,
        commit_sha: commitSha,
        diff: taskDiff,
    });
    const spent = await Project.addSpend(projectId, cost);

    if (inRepo) {
        const repo = project.repo_path as string;
        if (willMerge && taskBranchRef && commitSha) {
            const branch = taskBranchRef;
            const proceed = await withMergeLock(projectId, () => mergeTask(project, task, branch));
            await removeWorktree(repo, workdir).catch(() => {});
            if (!proceed) return; // conflict rejected: project paused
        } else {
            // research (detached), or code task with no changes: discard the worktree.
            await removeWorktree(repo, workdir).catch(() => {});
            if (willMerge && taskBranchRef) await deleteBranch(repo, taskBranchRef).catch(() => {});
        }
    }

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
        // A failed task pauses the project (handled in the worker 'failed' hook); stop
        // scheduling, but don't discard what merged.
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
    let result =
        last?.result?.trim() || ordered.map((t) => `## ${t.title}\n${t.result ?? ''}`).join('\n\n');
    // Code project: lead the deliverable with the branch + diffstat.
    if (project.integration_branch && project.repo_path && project.base_branch) {
        const stat = await diffStat(
            project.repo_path,
            project.base_branch,
            project.integration_branch,
        ).catch(() => '');
        result =
            `## Code delivered\nBranch \`${project.integration_branch}\` off \`${project.base_branch}\`.\n\n` +
            `\`\`\`\n${stat.trim() || '(no changes)'}\n\`\`\`\n\n${result}`;
    }
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
    // The takeaway (minus the link line) doubles as the project's overview synthesis.
    const summary = content
        .split('\n')
        .filter((l) => !l.includes('/projects/'))
        .join('\n')
        .trim();
    await Project.update(projectId, { summary }).catch(() => {});
}

/** Approve + launch: set running, ensure the worker + queue, schedule ready tasks. */
export async function launchProject(projectId: string, budgetUsd: number): Promise<void> {
    const project = await Project.get(projectId);
    if (project?.repo_path && !project.integration_branch) {
        const tasks = await ProjectTask.listByProject(projectId);
        if (tasks.some(isCodeTask)) await setupRepo(project);
    }
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
    if (fresh.length) {
        startProjectWorker();
        // A prior budget ceiling may have left the queue paused; reopen it.
        await getQueue()
            .resume()
            .catch(() => {});
    }
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
