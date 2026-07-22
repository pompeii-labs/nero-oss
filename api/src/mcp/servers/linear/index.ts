import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

/** Built-in Linear MCP. Reads LINEAR_API_KEY (personal API key), injected by the api. */

async function linear(query: string, variables: Record<string, unknown> = {}): Promise<any> {
    const key = process.env.LINEAR_API_KEY;
    if (!key) throw new Error('Linear is not configured. Set LINEAR_API_KEY.');
    const res = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: key },
        body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: any; errors?: unknown };
    if (!res.ok || json.errors)
        throw new Error(`Linear error: ${JSON.stringify(json.errors ?? res.status)}`);
    return json.data;
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

const ISSUE_FIELDS = `id identifier title priority url state { name type } assignee { name } team { key }`;

function buildServer() {
    const server = new McpServer({ name: 'linear', version: '1.0.0' });

    server.tool('linear_me', 'Show the authenticated Linear user.', {}, async () =>
        text((await linear(`{ viewer { id name email } }`)).viewer),
    );

    server.tool(
        'linear_teams',
        'List Linear teams (id, key, name) so you have team ids for creating issues.',
        {},
        async () => text((await linear(`{ teams { nodes { id key name } } }`)).teams.nodes),
    );

    server.tool(
        'linear_states',
        "List a team's workflow states (id, name, type) so you can move issues by state id.",
        { team_id: z.string() },
        async ({ team_id }) =>
            text(
                (
                    await linear(
                        `query($id:String!){ team(id:$id){ states { nodes { id name type } } } }`,
                        { id: team_id },
                    )
                ).team.states.nodes,
            ),
    );

    server.tool(
        'linear_my_issues',
        'List issues assigned to you, most-recent first. Optionally only active (unstarted/started) ones.',
        {
            active_only: z.boolean().default(true),
            limit: z.number().int().min(1).max(50).default(25),
        },
        async ({ active_only, limit }) => {
            const data = await linear(
                `query($n:Int!){ viewer { assignedIssues(first:$n, orderBy:updatedAt) { nodes { ${ISSUE_FIELDS} } } } }`,
                { n: limit },
            );
            let nodes = data.viewer.assignedIssues.nodes as any[];
            if (active_only)
                nodes = nodes.filter((i) =>
                    ['unstarted', 'started', 'backlog'].includes(i.state?.type),
                );
            return text(nodes);
        },
    );

    server.tool(
        'linear_search_issues',
        'Search Linear issues by text.',
        { query: z.string(), limit: z.number().int().min(1).max(50).default(25) },
        async ({ query, limit }) =>
            text(
                (
                    await linear(
                        `query($q:String!,$n:Int!){ issueSearch(query:$q, first:$n){ nodes { ${ISSUE_FIELDS} } } }`,
                        { q: query, n: limit },
                    )
                ).issueSearch.nodes,
            ),
    );

    server.tool(
        'linear_get_issue',
        'Get one Linear issue with its description and recent comments.',
        { id: z.string().describe('Issue id or identifier like ENG-123') },
        async ({ id }) =>
            text(
                (
                    await linear(
                        `query($id:String!){ issue(id:$id){ ${ISSUE_FIELDS} description createdAt updatedAt comments(first:20){ nodes { body user { name } createdAt } } } }`,
                        { id },
                    )
                ).issue,
            ),
    );

    server.tool(
        'linear_create_issue',
        'Create a Linear issue. Get team_id from linear_teams.',
        {
            team_id: z.string(),
            title: z.string(),
            description: z.string().optional(),
            priority: z
                .number()
                .int()
                .min(0)
                .max(4)
                .optional()
                .describe('0 none .. 1 urgent .. 4 low'),
        },
        async ({ team_id, title, description, priority }) => {
            const r = await linear(
                `mutation($i:IssueCreateInput!){ issueCreate(input:$i){ success issue { ${ISSUE_FIELDS} } } }`,
                { i: { teamId: team_id, title, description, priority } },
            );
            return text(r.issueCreate.issue);
        },
    );

    server.tool(
        'linear_update_issue',
        'Update a Linear issue: title, description, priority, or move it to a workflow state (state_id from linear_states).',
        {
            id: z.string(),
            title: z.string().optional(),
            description: z.string().optional(),
            state_id: z.string().optional(),
            priority: z.number().int().min(0).max(4).optional(),
        },
        async ({ id, title, description, state_id, priority }) => {
            const input: Record<string, unknown> = {};
            if (title !== undefined) input.title = title;
            if (description !== undefined) input.description = description;
            if (state_id !== undefined) input.stateId = state_id;
            if (priority !== undefined) input.priority = priority;
            const r = await linear(
                `mutation($id:String!,$i:IssueUpdateInput!){ issueUpdate(id:$id, input:$i){ success issue { ${ISSUE_FIELDS} } } }`,
                { id, i: input },
            );
            return text(r.issueUpdate.issue);
        },
    );

    server.tool(
        'linear_comment',
        'Add a comment to a Linear issue.',
        { issue_id: z.string(), body: z.string() },
        async ({ issue_id, body }) => {
            const r = await linear(
                `mutation($i:CommentCreateInput!){ commentCreate(input:$i){ success comment { id url } } }`,
                { i: { issueId: issue_id, body } },
            );
            return text(r.commentCreate.comment);
        },
    );

    return server;
}

await buildServer().connect(new StdioServerTransport());
console.error('Linear MCP ready on stdio');
