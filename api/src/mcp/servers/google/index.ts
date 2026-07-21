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

// ---- Gmail message parsing (keep email READABLE, never dump raw MIME/base64) ----

interface GPart {
    mimeType?: string;
    filename?: string;
    body?: { data?: string; size?: number };
    parts?: GPart[];
    headers?: { name: string; value: string }[];
}
interface GMessage {
    id?: string;
    threadId?: string;
    snippet?: string;
    labelIds?: string[];
    payload?: GPart;
}

const BODY_CAP = 4000;

function header(part: GPart | undefined, name: string): string {
    return part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function decodeB64(data?: string): string {
    return data ? Buffer.from(data, 'base64url').toString('utf8') : '';
}

function stripHtml(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<\/(p|div|br|tr|li|h[1-6])>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

/** Find the first non-attachment part of a given mime type, depth-first. */
function findPart(part: GPart, mime: string): GPart | undefined {
    if (part.mimeType === mime && part.body?.data && !part.filename) return part;
    for (const p of part.parts ?? []) {
        const found = findPart(p, mime);
        if (found) return found;
    }
    return undefined;
}

/** Prefer text/plain; fall back to stripped text/html; then a single-part body. */
function extractBody(payload?: GPart): string {
    if (!payload) return '';
    const plain = findPart(payload, 'text/plain');
    if (plain) return decodeB64(plain.body?.data);
    const html = findPart(payload, 'text/html');
    if (html) return stripHtml(decodeB64(html.body?.data));
    return payload.body?.data ? stripHtml(decodeB64(payload.body.data)) : '';
}

function cap(s: string, n = BODY_CAP): string {
    return s.length > n ? `${s.slice(0, n)}\n…[truncated, ${s.length} chars total]` : s;
}

/** A clean, model-friendly view of a message: headers + decoded, capped body. */
function summarizeMessage(msg: GMessage) {
    const p = msg.payload;
    return {
        id: msg.id,
        threadId: msg.threadId,
        from: header(p, 'From'),
        to: header(p, 'To'),
        cc: header(p, 'Cc') || undefined,
        date: header(p, 'Date'),
        subject: header(p, 'Subject'),
        labels: msg.labelIds,
        body: cap(extractBody(p)),
    };
}

/** Resolve label names (or ids) to label ids; system labels like INBOX pass through. */
async function resolveLabels(names?: string[]): Promise<string[]> {
    if (!names?.length) return [];
    const { labels = [] } = (await google(`${GMAIL}/labels`)) as {
        labels?: { id: string; name: string }[];
    };
    const byName = new Map(labels.map((l) => [l.name.toLowerCase(), l.id]));
    return names.map((n) => byName.get(n.toLowerCase()) ?? n);
}

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
    const server = new McpServer({ name: 'google', version: '1.1.0' });

    server.tool('gmail_profile', 'Show the authorized Gmail account profile.', {}, async () =>
        text(await google(`${GMAIL}/profile`)),
    );

    server.tool(
        'gmail_search',
        'Search Gmail with standard syntax. Returns a COMPACT list (id, from, subject, date, one-line snippet), never full bodies. Use gmail_get_message to read a specific one, or gmail_get_thread for a conversation.',
        {
            query: z
                .string()
                .describe('Examples: is:unread, newer_than:7d, from:someone@example.com'),
            max_results: z.number().int().min(1).max(30).default(15),
        },
        async ({ query: q, max_results }) => {
            const list = (await google(
                `${GMAIL}/messages?${query({ q, maxResults: max_results })}`,
            )) as {
                messages?: { id: string }[];
            };
            const metas = await Promise.all(
                (list.messages ?? []).map((m) =>
                    google(
                        `${GMAIL}/messages/${encodeId(m.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
                    ).catch(() => null),
                ),
            );
            const messages = metas.filter(Boolean).map((m) => {
                const msg = m as GMessage;
                return {
                    id: msg.id,
                    threadId: msg.threadId,
                    from: header(msg.payload, 'From'),
                    subject: header(msg.payload, 'Subject'),
                    date: header(msg.payload, 'Date'),
                    unread: msg.labelIds?.includes('UNREAD') ?? false,
                    snippet: msg.snippet,
                };
            });
            return text({ count: messages.length, messages });
        },
    );

    server.tool(
        'gmail_get_message',
        'Read one Gmail message: sender/recipients, subject, date, and the decoded PLAIN-TEXT body (HTML stripped, long bodies truncated). Never returns the raw MIME payload.',
        { message_id: z.string() },
        async ({ message_id }) =>
            text(
                summarizeMessage(
                    (await google(
                        `${GMAIL}/messages/${encodeId(message_id)}?format=full`,
                    )) as GMessage,
                ),
            ),
    );

    server.tool(
        'gmail_get_thread',
        'Read a whole Gmail conversation by thread id. Each message is summarized (from, date, decoded + truncated body), not raw.',
        { thread_id: z.string() },
        async ({ thread_id }) => {
            const t = (await google(`${GMAIL}/threads/${encodeId(thread_id)}?format=full`)) as {
                messages?: GMessage[];
            };
            return text({ thread_id, messages: (t.messages ?? []).map(summarizeMessage) });
        },
    );

    server.tool(
        'gmail_labels',
        'List Gmail labels with their ids and unread/total counts.',
        {},
        async () => text(await google(`${GMAIL}/labels`)),
    );

    server.tool(
        'gmail_create_label',
        'Create a new Gmail label (like a folder/tag).',
        { name: z.string().min(1) },
        async ({ name }) =>
            text(
                await google(`${GMAIL}/labels`, {
                    method: 'POST',
                    body: JSON.stringify({
                        name,
                        labelListVisibility: 'labelShow',
                        messageListVisibility: 'show',
                    }),
                }),
            ),
    );

    server.tool(
        'gmail_modify_message',
        'Add or remove labels on a message. Labels can be names or ids. Use this to organize (add a label), archive (remove "INBOX"), mark read (remove "UNREAD"), mark unread (add "UNREAD"), star (add "STARRED"), or flag important (add "IMPORTANT").',
        {
            message_id: z.string(),
            add_labels: z.array(z.string()).optional().describe('Label names or ids to add.'),
            remove_labels: z.array(z.string()).optional().describe('Label names or ids to remove.'),
        },
        async ({ message_id, add_labels, remove_labels }) => {
            const [addLabelIds, removeLabelIds] = await Promise.all([
                resolveLabels(add_labels),
                resolveLabels(remove_labels),
            ]);
            const r = (await google(`${GMAIL}/messages/${encodeId(message_id)}/modify`, {
                method: 'POST',
                body: JSON.stringify({ addLabelIds, removeLabelIds }),
            })) as GMessage;
            return text({ message_id, labels: r.labelIds });
        },
    );

    server.tool(
        'gmail_trash',
        'Move a Gmail message to the trash.',
        { message_id: z.string() },
        async ({ message_id }) => {
            await google(`${GMAIL}/messages/${encodeId(message_id)}/trash`, { method: 'POST' });
            return text({ status: 'trashed', message_id });
        },
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
    server.tool(
        'calendar_update_event',
        'Update fields on an existing Google Calendar event. Only pass what changes (a patch). Use only when the user explicitly asks.',
        {
            calendar_id: z.string().default('primary'),
            event_id: z.string(),
            summary: z.string().optional(),
            description: z.string().optional(),
            start: z.string().datetime().optional(),
            end: z.string().datetime().optional(),
            time_zone: z.string().default('America/New_York'),
            location: z.string().optional(),
        },
        async ({
            calendar_id,
            event_id,
            summary,
            description,
            start,
            end,
            time_zone,
            location,
        }) => {
            const patch: Record<string, unknown> = {};
            if (summary !== undefined) patch.summary = summary;
            if (description !== undefined) patch.description = description;
            if (location !== undefined) patch.location = location;
            if (start) patch.start = { dateTime: start, timeZone: time_zone };
            if (end) patch.end = { dateTime: end, timeZone: time_zone };
            return text(
                await google(
                    `${CALENDAR}/calendars/${encodeId(calendar_id)}/events/${encodeId(event_id)}`,
                    { method: 'PATCH', body: JSON.stringify(patch) },
                ),
            );
        },
    );
    server.tool(
        'calendar_delete_event',
        'Delete a Google Calendar event. Use only when the user explicitly asks.',
        { calendar_id: z.string().default('primary'), event_id: z.string() },
        async ({ calendar_id, event_id }) => {
            await google(
                `${CALENDAR}/calendars/${encodeId(calendar_id)}/events/${encodeId(event_id)}`,
                { method: 'DELETE' },
            );
            return text({ status: 'deleted', event_id });
        },
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
