import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

/** Built-in GitHub MCP. Reads GITHUB_TOKEN (personal access token), injected by the api. */

async function github(path: string, init: RequestInit = {}): Promise<any> {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GitHub is not configured. Set GITHUB_TOKEN.');
    const res = await fetch(`https://api.github.com${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'nero',
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            ...(init.headers as Record<string, string>),
        },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`GitHub error ${res.status}: ${JSON.stringify(json)}`);
    return json;
}

function text(value: unknown) {
    return {
        content: [
            {
                type: 'text' as const,
                text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
            },
        ],
    };
}
const cap = (s: string | null | undefined, n = 4000) =>
    !s ? '' : s.length > n ? `${s.slice(0, n)}\n…[truncated, ${s.length} chars]` : s;

function buildServer() {
    const server = new McpServer({ name: 'github', version: '1.0.0' });

    server.tool('github_me', 'Show the authenticated GitHub user.', {}, async () => {
        const u = await github('/user');
        return text({ login: u.login, name: u.name, url: u.html_url });
    });

    server.tool(
        'github_repos',
        'List your repositories, most-recently-updated first.',
        { limit: z.number().int().min(1).max(50).default(20) },
        async ({ limit }) => {
            const repos = await github(`/user/repos?sort=updated&per_page=${limit}`);
            return text(
                (repos as any[]).map((r) => ({
                    full_name: r.full_name,
                    private: r.private,
                    description: r.description,
                    updated: r.updated_at,
                    url: r.html_url,
                })),
            );
        },
    );

    server.tool(
        'github_search_issues',
        'Search issues and PRs with GitHub search syntax. Examples: "is:open is:pr review-requested:@me", "is:issue assignee:@me is:open", "repo:owner/name is:pr is:open".',
        { query: z.string(), limit: z.number().int().min(1).max(30).default(20) },
        async ({ query, limit }) => {
            const r = await github(
                `/search/issues?q=${encodeURIComponent(query)}&per_page=${limit}`,
            );
            return text({
                total: r.total_count,
                items: (r.items as any[]).map((i) => ({
                    repo: (i.repository_url ?? '').replace('https://api.github.com/repos/', ''),
                    number: i.number,
                    title: i.title,
                    state: i.state,
                    is_pr: !!i.pull_request,
                    user: i.user?.login,
                    url: i.html_url,
                })),
            });
        },
    );

    server.tool(
        'github_get_issue',
        'Get one issue or PR (by number) with its body (truncated). Works for both issues and PRs.',
        { owner: z.string(), repo: z.string(), number: z.number().int() },
        async ({ owner, repo, number }) => {
            const i = await github(`/repos/${owner}/${repo}/issues/${number}`);
            return text({
                number: i.number,
                title: i.title,
                state: i.state,
                is_pr: !!i.pull_request,
                user: i.user?.login,
                labels: (i.labels as any[])?.map((l) => l.name),
                url: i.html_url,
                body: cap(i.body),
            });
        },
    );

    server.tool(
        'github_list_prs',
        'List pull requests for a repo.',
        {
            owner: z.string(),
            repo: z.string(),
            state: z.enum(['open', 'closed', 'all']).default('open'),
            limit: z.number().int().min(1).max(30).default(20),
        },
        async ({ owner, repo, state, limit }) => {
            const prs = await github(
                `/repos/${owner}/${repo}/pulls?state=${state}&sort=updated&direction=desc&per_page=${limit}`,
            );
            return text(
                (prs as any[]).map((p) => ({
                    number: p.number,
                    title: p.title,
                    state: p.state,
                    draft: p.draft,
                    user: p.user?.login,
                    head: p.head?.ref,
                    base: p.base?.ref,
                    url: p.html_url,
                })),
            );
        },
    );

    server.tool(
        'github_pr_checks',
        'CI/check status for a PR (pass/fail/pending per check).',
        { owner: z.string(), repo: z.string(), number: z.number().int() },
        async ({ owner, repo, number }) => {
            const pr = await github(`/repos/${owner}/${repo}/pulls/${number}`);
            const runs = await github(`/repos/${owner}/${repo}/commits/${pr.head.sha}/check-runs`);
            return text({
                pr: number,
                sha: pr.head.sha,
                checks: (runs.check_runs as any[]).map((c) => ({
                    name: c.name,
                    status: c.status,
                    conclusion: c.conclusion,
                })),
            });
        },
    );

    server.tool(
        'github_create_issue',
        'Open a new issue in a repo. Use only when the user explicitly asks.',
        {
            owner: z.string(),
            repo: z.string(),
            title: z.string(),
            body: z.string().optional(),
            labels: z.array(z.string()).optional(),
        },
        async ({ owner, repo, title, body, labels }) => {
            const i = await github(`/repos/${owner}/${repo}/issues`, {
                method: 'POST',
                body: JSON.stringify({ title, body, labels }),
            });
            return text({ number: i.number, title: i.title, url: i.html_url });
        },
    );

    server.tool(
        'github_notifications',
        'Your unread GitHub notifications.',
        { limit: z.number().int().min(1).max(50).default(30) },
        async ({ limit }) => {
            const n = await github(`/notifications?per_page=${limit}`);
            return text(
                (n as any[]).map((x) => ({
                    repo: x.repository?.full_name,
                    title: x.subject?.title,
                    type: x.subject?.type,
                    reason: x.reason,
                    updated: x.updated_at,
                })),
            );
        },
    );

    return server;
}

await buildServer().connect(new StdioServerTransport());
console.error('GitHub MCP ready on stdio');
