import { runShell, type ShellResult } from '../../tools/shell';
import { Logger } from '../../lib/logger';

const log = new Logger('projects.git');

function q(s: string): string {
    return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Run a git command in `cwd`. Thin wrapper so callers read like git. */
async function git(cwd: string, args: string): Promise<ShellResult> {
    return runShell(`git ${args}`, { cwd });
}

async function gitOk(cwd: string, args: string): Promise<string> {
    const r = await git(cwd, args);
    if (r.code !== 0) {
        throw new Error(`git ${args} failed: ${r.stderr.trim() || r.stdout.trim()}`);
    }
    return r.stdout.trim();
}

/** Is `dir` inside a git work tree? */
export async function isGitRepo(dir: string): Promise<boolean> {
    const r = await git(dir, 'rev-parse --is-inside-work-tree');
    return r.code === 0 && r.stdout.trim() === 'true';
}

/** The repo's current branch (used as the integration base). */
export function currentBranch(repo: string): Promise<string> {
    return gitOk(repo, 'rev-parse --abbrev-ref HEAD');
}

export function headSha(dir: string): Promise<string> {
    return gitOk(dir, 'rev-parse HEAD');
}

/** Create a branch ref at `base` without checking it out (the main repo stays as-is). */
export async function createBranch(repo: string, name: string, base: string): Promise<void> {
    await gitOk(repo, `branch ${q(name)} ${q(base)}`);
}

/** Check out an existing branch into a fresh worktree. */
export async function addWorktree(repo: string, path: string, branch: string): Promise<void> {
    await gitOk(repo, `worktree add ${q(path)} ${q(branch)}`);
}

/** Create a new branch at `startPoint` and check it out into a fresh worktree. */
export async function addWorktreeNewBranch(
    repo: string,
    path: string,
    newBranch: string,
    startPoint: string,
): Promise<void> {
    await gitOk(repo, `worktree add -b ${q(newBranch)} ${q(path)} ${q(startPoint)}`);
}

/** Check out `startPoint` into a detached worktree (no branch). For read-only tasks
 *  (research) that need to see the code but never commit. */
export async function addWorktreeDetached(
    repo: string,
    path: string,
    startPoint: string,
): Promise<void> {
    await gitOk(repo, `worktree add --detach ${q(path)} ${q(startPoint)}`);
}

export async function removeWorktree(repo: string, path: string): Promise<void> {
    const r = await git(repo, `worktree remove --force ${q(path)}`);
    if (r.code !== 0) log.warn('worktree remove failed', { path, err: r.stderr.trim() });
}

/** Best-effort branch delete (ignores absence); used to reset before a retry. */
export async function deleteBranch(repo: string, name: string): Promise<void> {
    await git(repo, `branch -D ${q(name)}`);
}

/** Stage everything and commit. Returns the new sha, or null if there was nothing
 *  to commit (an agent that produced no file changes). */
export async function commitAll(cwd: string, message: string): Promise<string | null> {
    await gitOk(cwd, 'add -A');
    const status = await gitOk(cwd, 'status --porcelain');
    if (!status) return null;
    await gitOk(cwd, `commit --no-verify -m ${q(message)}`);
    return headSha(cwd);
}

export interface MergeOutcome {
    clean: boolean;
    /** Conflicted file paths (empty when clean). */
    conflicts: string[];
}

/** Merge `from` into whatever `worktree` has checked out. On conflict, leaves the
 *  worktree in the conflicted state (files with markers, index unmerged) for a
 *  resolve-agent to fix, and reports the conflicted paths. */
export async function mergeBranch(
    worktree: string,
    from: string,
    message: string,
): Promise<MergeOutcome> {
    const r = await git(worktree, `merge --no-ff --no-edit -m ${q(message)} ${q(from)}`);
    if (r.code === 0) return { clean: true, conflicts: [] };
    const unmerged = await git(worktree, 'diff --name-only --diff-filter=U');
    const conflicts = unmerged.stdout
        .trim()
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    // A non-zero exit with no unmerged files is a real failure, not a conflict.
    if (conflicts.length === 0) {
        throw new Error(`git merge failed: ${r.stderr.trim() || r.stdout.trim()}`);
    }
    return { clean: false, conflicts };
}

/** Commit the currently-staged state (used after a resolve-agent stages its fix). */
export async function commitMerge(worktree: string, message: string): Promise<string> {
    await gitOk(worktree, `commit --no-verify --no-edit -m ${q(message)}`);
    return headSha(worktree);
}

/** Abort an in-progress merge (on reject). */
export async function abortMerge(worktree: string): Promise<void> {
    await git(worktree, 'merge --abort');
}

/** The staged diff, shown in the merge-approval card as the proposed resolution. */
export function stagedDiff(worktree: string): Promise<string> {
    return gitOk(worktree, 'diff --cached');
}

/** `git diff --stat base..ref`, for the deliverable summary. */
export function diffStat(dir: string, base: string, ref: string): Promise<string> {
    return gitOk(dir, `diff --stat ${q(base)}..${q(ref)}`);
}

export function fullDiff(dir: string, base: string, ref: string): Promise<string> {
    return gitOk(dir, `diff ${q(base)}..${q(ref)}`);
}

export interface VerifyOutcome {
    ok: boolean;
    output: string;
}

/** Run a verify command (build/test) in `cwd`. */
export async function runVerify(cwd: string, command: string): Promise<VerifyOutcome> {
    const r = await runShell(command, { cwd, timeoutMs: 5 * 60_000 });
    const output = [r.stdout, r.stderr].filter(Boolean).join('\n').trim();
    return { ok: r.code === 0, output };
}

/** Push the integration branch and open a PR via gh. Returns the PR url. Requires a
 *  remote + gh auth; the only step that leaves the local machine, so it is explicit. */
export async function openPr(
    repo: string,
    branch: string,
    base: string,
    title: string,
    body: string,
): Promise<string> {
    await gitOk(repo, `push -u origin ${q(branch)}`);
    const r = await runShell(
        `gh pr create --head ${q(branch)} --base ${q(base)} --title ${q(title)} --body ${q(body)}`,
        { cwd: repo },
    );
    if (r.code !== 0) throw new Error(r.stderr.trim() || r.stdout.trim() || 'gh pr create failed');
    return r.stdout.trim();
}
