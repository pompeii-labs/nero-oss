import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

/**
 * Built-in Google (Gmail + Calendar) MCP server. Deliberately "dumb": it holds no
 * client secret and does no OAuth. Nero's api owns the OAuth flow and injects a fresh
 * access token as GOOGLE_ACCESS_TOKEN in this process's env at (re)connect. See
 * api/src/mcp/{catalog,oauth,reconcile}.ts.
 */

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const CALENDAR = 'https://www.googleapis.com/calendar/v3';

/** Authenticated Google API fetch using the injected access token. */
async function google(url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const token = process.env.GOOGLE_ACCESS_TOKEN;
    if (!token)
        throw new Error(
            'Google is not authorized yet. Ask the user to connect Google (authorize_integration).',
        );
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body) headers.set('Content-Type', 'application/json');
    const res = await fetch(url, { ...init, headers });
    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(`Google API error ${res.status}: ${JSON.stringify(payload)}`);
    return payload;
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
function query(params: Record<string, string | number | boolean | undefined>) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) p.set(k, String(v));
    return p.toString();
}
const encodeId = (v: string) => encodeURIComponent(v);

// Process-local: after a restart, existing Gmail drafts remain in Gmail but can't be
// sent by this MCP until a fresh draft is created and explicitly approved.
type DraftRecord = {
    gmailDraftId: string;
    to: string[];
    cc: string[];
    subject: string;
    createdAt: string;
    sentAt?: string;
};
const draftRegistry = new Map<string, DraftRecord>();

const b64url = (v: string) => Buffer.from(v, 'utf8').toString('base64url');
function cleanHeader(value: string, field: string) {
    if (/\r|\n/.test(value)) throw new Error(`${field} cannot contain line breaks.`);
    return value;
}
function buildMessage({
    to,
    cc,
    bcc,
    subject,
    body,
}: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
}) {
    const headers = [
        `To: ${to.join(', ')}`,
        ...(cc?.length ? [`Cc: ${cc.join(', ')}`] : []),
        ...(bcc?.length ? [`Bcc: ${bcc.join(', ')}`] : []),
        `Subject: ${cleanHeader(subject, 'Subject')}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
    ];
    return b64url(`${headers.join('\r\n')}\r\n\r\n${body}`);
}

const emailAddress = z.string().email();

function buildServer() {
    const server = new McpServer({ name: 'google', version: '1.0.0' });

    server.tool('gmail_profile', 'Show the authorized Gmail account profile.', {}, async () =>
        text(await google(`${GMAIL}/profile`)),
    );
    server.tool(
        'gmail_search',
        'Search Gmail messages using standard Gmail search syntax. Returns message IDs and metadata, not full bodies.',
        {
            query: z
                .string()
                .describe('Examples: is:unread, newer_than:7d, from:someone@example.com'),
            max_results: z.number().int().min(1).max(50).default(20),
        },
        async ({ query: q, max_results }) =>
            text(await google(`${GMAIL}/messages?${query({ q, maxResults: max_results })}`)),
    );
    server.tool(
        'gmail_get_message',
        'Get a Gmail message by ID, including headers and decoded text body.',
        { message_id: z.string() },
        async ({ message_id }) =>
            text(await google(`${GMAIL}/messages/${encodeId(message_id)}?format=full`)),
    );
    server.tool('gmail_labels', 'List Gmail labels with unread and total counts.', {}, async () =>
        text(await google(`${GMAIL}/labels`)),
    );
    server.tool(
        'gmail_create_draft',
        'Create an email draft in Gmail and register it in this running MCP. This does not send anything. A separate explicit approval and send step is required.',
        {
            to: z.array(emailAddress).min(1),
            cc: z.array(emailAddress).optional(),
            bcc: z.array(emailAddress).optional(),
            subject: z.string().min(1),
            body: z.string().min(1),
        },
        async ({ to, cc, bcc, subject, body }) => {
            const created = await google(`${GMAIL}/drafts`, {
                method: 'POST',
                body: JSON.stringify({
                    message: { raw: buildMessage({ to, cc, bcc, subject, body }) },
                }),
            });
            const approval_id = crypto.randomUUID();
            draftRegistry.set(approval_id, {
                gmailDraftId: String(created.id),
                to,
                cc: cc ?? [],
                subject,
                createdAt: new Date().toISOString(),
            });
            return text({
                approval_id,
                gmail_draft_id: created.id,
                status: 'draft_created_pending_explicit_send',
                to,
                cc: cc ?? [],
                subject,
                instruction:
                    'Show this draft to the user. Call gmail_send_draft with this approval_id only after the user explicitly approves this exact draft.',
            });
        },
    );
    server.tool(
        'gmail_list_pending_drafts',
        'List email drafts created during this MCP session and their approval state. This is the only set eligible for sending.',
        {},
        async () =>
            text(
                [...draftRegistry.entries()].map(([approval_id, draft]) => ({
                    approval_id,
                    ...draft,
                })),
            ),
    );
    server.tool(
        'gmail_send_draft',
        'Send a Gmail draft only after the user explicitly approves this exact draft. Accepts only the opaque approval_id returned by gmail_create_draft. This action sends email externally.',
        { approval_id: z.string().uuid() },
        async ({ approval_id }) => {
            const draft = draftRegistry.get(approval_id);
            if (!draft)
                throw new Error(
                    'Unknown or expired approval ID. This MCP refuses to send drafts it did not create in this session.',
                );
            if (draft.sentAt) throw new Error('This draft has already been sent.');
            const result = await google(`${GMAIL}/drafts/send`, {
                method: 'POST',
                body: JSON.stringify({ id: draft.gmailDraftId }),
            });
            draft.sentAt = new Date().toISOString();
            return text({
                approval_id,
                gmail_message_id: result.id,
                status: 'sent',
                sent_at: draft.sentAt,
            });
        },
    );

    server.tool(
        'calendar_list',
        'List Google calendars available to the authorized account.',
        {},
        async () => text(await google(`${CALENDAR}/users/me/calendarList`)),
    );
    server.tool(
        'calendar_events',
        'List upcoming events from a Google Calendar in a time window.',
        {
            calendar_id: z.string().default('primary'),
            time_min: z.string().datetime().optional().describe('ISO-8601 start, defaults to now'),
            time_max: z.string().datetime().optional().describe('ISO-8601 end'),
            max_results: z.number().int().min(1).max(100).default(20),
        },
        async ({ calendar_id, time_min, time_max, max_results }) =>
            text(
                await google(
                    `${CALENDAR}/calendars/${encodeId(calendar_id)}/events?${query({
                        timeMin: time_min ?? new Date().toISOString(),
                        timeMax: time_max,
                        singleEvents: true,
                        orderBy: 'startTime',
                        maxResults: max_results,
                    })}`,
                ),
            ),
    );
    server.tool(
        'calendar_get_event',
        'Get one Google Calendar event by calendar and event ID.',
        { calendar_id: z.string().default('primary'), event_id: z.string() },
        async ({ calendar_id, event_id }) =>
            text(
                await google(
                    `${CALENDAR}/calendars/${encodeId(calendar_id)}/events/${encodeId(event_id)}`,
                ),
            ),
    );
    server.tool(
        'calendar_create_event',
        'Create a Google Calendar event. Use only when the user explicitly asks to add or schedule it.',
        {
            calendar_id: z.string().default('primary'),
            summary: z.string(),
            description: z.string().optional(),
            start: z.string().datetime(),
            end: z.string().datetime(),
            time_zone: z.string().default('America/New_York'),
            location: z.string().optional(),
            attendees: z.array(z.string().email()).optional(),
        },
        async ({ calendar_id, summary, description, start, end, time_zone, location, attendees }) =>
            text(
                await google(`${CALENDAR}/calendars/${encodeId(calendar_id)}/events`, {
                    method: 'POST',
                    body: JSON.stringify({
                        summary,
                        description,
                        location,
                        attendees: attendees?.map((email) => ({ email })),
                        start: { dateTime: start, timeZone: time_zone },
                        end: { dateTime: end, timeZone: time_zone },
                    }),
                }),
            ),
    );

    return server;
}

const httpPort = Number(process.env.MCP_HTTP_PORT ?? 0);
if (httpPort > 0) {
    // Host-launch (Path B): serve HTTP with a fresh server per request.
    const { StreamableHTTPServerTransport } =
        await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
    const http = await import('node:http');
    const authToken = process.env.MCP_HTTP_TOKEN;
    const bindHost = process.env.MCP_HTTP_HOST ?? '0.0.0.0';
    const dispatch = async (
        req: import('node:http').IncomingMessage,
        res: import('node:http').ServerResponse,
        parsed: unknown,
    ) => {
        const s = buildServer();
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        res.on('close', () => {
            void transport.close();
            void s.close();
        });
        await s.connect(transport);
        await transport.handleRequest(req, res, parsed);
    };
    http.createServer((req, res) => {
        if (authToken && req.headers.authorization !== `Bearer ${authToken}`) {
            res.writeHead(401).end('unauthorized');
            return;
        }
        if (req.method === 'POST') {
            let body = '';
            req.on('data', (c) => (body += c));
            req.on('end', () => {
                let parsed: unknown;
                try {
                    parsed = body ? JSON.parse(body) : undefined;
                } catch {
                    res.writeHead(400).end('bad json');
                    return;
                }
                void dispatch(req, res, parsed).catch(
                    (e) => !res.headersSent && res.writeHead(500).end(String(e)),
                );
            });
        } else {
            void dispatch(req, res, undefined).catch(
                (e) => !res.headersSent && res.writeHead(500).end(String(e)),
            );
        }
    }).listen(httpPort, bindHost, () => console.error(`Google MCP ready on http :${httpPort}`));
} else {
    await buildServer().connect(new StdioServerTransport());
    console.error('Google MCP ready on stdio');
}
