import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

/**
 * Built-in Google Drive + Docs + Sheets MCP. Dumb: reads GOOGLE_ACCESS_TOKEN (a Drive-
 * scoped token the api owns + injects). Separate OAuth token from the Gmail/Calendar one.
 */

const DRIVE = 'https://www.googleapis.com/drive/v3';
const DOCS = 'https://docs.googleapis.com/v1';
const SHEETS = 'https://sheets.googleapis.com/v4';

function authHeaders(json = false): Record<string, string> {
    const token = process.env.GOOGLE_ACCESS_TOKEN;
    if (!token)
        throw new Error('Google Drive is not authorized yet (authorize_integration gdrive).');
    return {
        Authorization: `Bearer ${token}`,
        ...(json ? { 'Content-Type': 'application/json' } : {}),
    };
}

async function gJson(url: string, init: RequestInit = {}): Promise<any> {
    const res = await fetch(url, {
        ...init,
        headers: { ...authHeaders(!!init.body), ...(init.headers as Record<string, string>) },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Google API error ${res.status}: ${JSON.stringify(json)}`);
    return json;
}
async function gText(url: string): Promise<string> {
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Google API error ${res.status}: ${await res.text()}`);
    return res.text();
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
const cap = (s: string, n = 6000) =>
    s.length > n ? `${s.slice(0, n)}\n…[truncated, ${s.length} chars]` : s;

const EXPORT_AS: Record<string, string> = {
    'application/vnd.google-apps.document': 'text/plain',
    'application/vnd.google-apps.spreadsheet': 'text/csv',
    'application/vnd.google-apps.presentation': 'text/plain',
};

function buildServer() {
    const server = new McpServer({ name: 'gdrive', version: '1.0.0' });

    server.tool(
        'drive_search',
        "Search Google Drive files. Use Drive query syntax, e.g. name contains 'budget', mimeType='application/vnd.google-apps.document', or a plain phrase (matched against full text).",
        { query: z.string(), limit: z.number().int().min(1).max(50).default(20) },
        async ({ query, limit }) => {
            const q = /[:=]|contains/.test(query)
                ? query
                : `fullText contains '${query.replace(/'/g, "\\'")}'`;
            const params = new URLSearchParams({
                q: `${q} and trashed=false`,
                pageSize: String(limit),
                orderBy: 'modifiedTime desc',
                fields: 'files(id,name,mimeType,modifiedTime,webViewLink,owners(displayName))',
            });
            const r = await gJson(`${DRIVE}/files?${params}`);
            return text(r.files);
        },
    );

    server.tool(
        'drive_read_file',
        'Read a Drive file as text. Google Docs export as plain text, Sheets as CSV, and text files download directly (long content truncated).',
        { file_id: z.string() },
        async ({ file_id }) => {
            const meta = await gJson(`${DRIVE}/files/${file_id}?fields=id,name,mimeType`);
            const exportMime = EXPORT_AS[meta.mimeType];
            const body = exportMime
                ? await gText(
                      `${DRIVE}/files/${file_id}/export?mimeType=${encodeURIComponent(exportMime)}`,
                  )
                : await gText(`${DRIVE}/files/${file_id}?alt=media`);
            return text({
                id: meta.id,
                name: meta.name,
                mimeType: meta.mimeType,
                content: cap(body),
            });
        },
    );

    server.tool(
        'docs_create',
        'Create a new Google Doc with a title and optional initial text.',
        { title: z.string(), body: z.string().optional() },
        async ({ title, body }) => {
            const doc = await gJson(`${DOCS}/documents`, {
                method: 'POST',
                body: JSON.stringify({ title }),
            });
            if (body) {
                await gJson(`${DOCS}/documents/${doc.documentId}:batchUpdate`, {
                    method: 'POST',
                    body: JSON.stringify({
                        requests: [{ insertText: { endOfSegmentLocation: {}, text: body } }],
                    }),
                });
            }
            return text({
                document_id: doc.documentId,
                title: doc.title,
                url: `https://docs.google.com/document/d/${doc.documentId}/edit`,
            });
        },
    );

    server.tool(
        'docs_append',
        'Append text to the end of a Google Doc.',
        { document_id: z.string(), text: z.string() },
        async ({ document_id, text: body }) => {
            await gJson(`${DOCS}/documents/${document_id}:batchUpdate`, {
                method: 'POST',
                body: JSON.stringify({
                    requests: [{ insertText: { endOfSegmentLocation: {}, text: body } }],
                }),
            });
            return text({ status: 'appended', document_id });
        },
    );

    server.tool(
        'sheets_read',
        'Read a range from a Google Sheet (A1 notation, e.g. "Sheet1!A1:D20").',
        { spreadsheet_id: z.string(), range: z.string() },
        async ({ spreadsheet_id, range }) => {
            const r = await gJson(
                `${SHEETS}/spreadsheets/${spreadsheet_id}/values/${encodeURIComponent(range)}`,
            );
            return text({ range: r.range, values: r.values ?? [] });
        },
    );

    server.tool(
        'sheets_append',
        'Append rows to a Google Sheet. `values` is an array of rows, each an array of cell values.',
        {
            spreadsheet_id: z.string(),
            range: z.string().describe('A1 range of the table to append to, e.g. "Sheet1!A1"'),
            values: z.array(z.array(z.union([z.string(), z.number()]))),
        },
        async ({ spreadsheet_id, range, values }) => {
            const r = await gJson(
                `${SHEETS}/spreadsheets/${spreadsheet_id}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
                { method: 'POST', body: JSON.stringify({ values }) },
            );
            return text({ status: 'appended', updates: r.updates });
        },
    );

    return server;
}

await buildServer().connect(new StdioServerTransport());
console.error('Google Drive MCP ready on stdio');
