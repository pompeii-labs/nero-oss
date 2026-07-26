import { Action, type ActionData, type ActionFn } from '../../models/action';
import { Secret } from '../../models/secret';
import { Settings } from '../../models/settings';
import { clientFor } from '../../lib/openrouter';
import { Logger } from '@nero/shared/logger';
import { Actions } from './index';
import { runShell } from '../../tools/shell';
import { TEMPLATES, getTemplate } from './catalog';

const log = new Logger('action-author');

/** Enough to fix an auth header or a wrong path; not enough to burn a model budget
 *  flailing at an API that was never going to work. */
const MAX_ATTEMPTS = 4;

/**
 * Nero authoring a dial action, in the background, on the planning model.
 *
 * The loop is the point: he drafts, **runs it for real**, reads what came back, and
 * fixes it. A dial button that was never fired is a guess. For lights, running it is
 * also the demo — you watch the bulb change on the attempt that works.
 *
 * He never sees a secret value. The prompt carries secret *names* only, and he's told
 * to reference them as `${NAME}`; resolution happens at run time, server-side.
 */

/** How many files he may open before he has to commit to a draft. */
const MAX_INSPECTS = 8;
const FILE_LIMIT = 12_000;

interface Draft {
    /** Reuse a catalogue template instead of writing one, when one fits. */
    template?: string;
    params?: Record<string, string>;
    label?: string;
    icon?: string;
    kind?: 'http' | 'shell' | 'prompt' | 'agent';
    fn?: ActionFn;
    body?: string;
    confirm?: boolean;
    /** Why this should work, or what he changed after a failure. */
    note?: string;
    /** Read a file before drafting. Lets him work out an existing integration's logic
     *  (an MCP server he wrote, say) and reimplement it as a direct action. */
    read?: string;
    /** List a directory before drafting. */
    list?: string;
}

/** Inspect the host filesystem on the model's behalf. Runs through the runner, so in
 *  the container this reaches the *host* — where the MCP sources and devices live. */
async function inspect(draft: Draft): Promise<string> {
    try {
        if (draft.list) {
            const r = await runShell(`ls -la ${JSON.stringify(draft.list)}`, { timeoutMs: 10_000 });
            return r.code === 0
                ? r.stdout.slice(0, FILE_LIMIT)
                : `error: ${r.stderr.slice(0, 400)}`;
        }
        const r = await runShell(`cat ${JSON.stringify(draft.read)}`, { timeoutMs: 10_000 });
        if (r.code !== 0) return `error: ${r.stderr.slice(0, 400)}`;
        const text = r.stdout;
        return text.length > FILE_LIMIT
            ? `${text.slice(0, FILE_LIMIT)}\n…(truncated, ${text.length} bytes total)`
            : text;
    } catch (err) {
        return `error: ${err instanceof Error ? err.message : String(err)}`;
    }
}

function systemPrompt(secretNames: string[]): string {
    const catalogue = TEMPLATES.map(
        (t) =>
            `  ${t.id} (${t.provider}) — ${t.description} params: ${
                t.params.map((p) => p.key).join(', ') || 'none'
            }${t.requiredSecrets.length ? ` needs: ${t.requiredSecrets.join(', ')}` : ''}`,
    ).join('\n');

    return `You are building a one-press button for the user's dial. It fires directly, with no model in the loop, so it has to be a self-contained request or command.

Reply with ONLY a JSON object, no prose, no code fence.

Prefer an existing template when one fits:
  {"template":"lifx.color","params":{"selector":"group:Bedroom","color":"red"},"label":"Red"}

Otherwise author it:
  {"label":"Short Name","icon":"zap","kind":"http","fn":{"kind":"http","method":"POST","url":"https://...","headers":{"Authorization":"Bearer \${SOME_KEY}"},"body":"{...}"},"note":"why this works"}

Templates available:
${catalogue}

Before drafting you may look around the machine, one step at a time:
  {"list":"/path/to/dir"}   or   {"read":"/path/to/file.ts"}
Use this when the user points at something that already exists — an MCP server, a
script, a config. Read it, work out what it actually does, then reimplement that logic
as a direct action. Some integrations are not HTTP at all (a LAN device, an IR blaster)
and can only become a "shell" action that invokes the same code.

Rules:
- kind is "http" or "shell". Never anything else for a direct action.
- If the button needs judgement or several steps, use kind "agent" with a "body" holding the goal in second person. It runs as a full agent turn with all of Nero's tools, including his MCP servers.
- Credentials: reference them as \${NAME} exactly. NEVER inline a key, and never invent a name.
  Secret names that exist: ${secretNames.length ? secretNames.join(', ') : '(none set)'}
- label is at most 14 characters, it goes under a small icon.
- icon is one of: zap, terminal, play, refresh, moon, music, camera, chat, mic, globe, home, lock, wave, palette, settings, wrench, radio.
- Set "confirm": true for anything destructive or expensive.
- A shell action is a COMMAND LINE, never a program in a string. No node -e, no
  bun -e, no python -c, no heredocs. If the logic does not exist on disk yet, write a
  small script file first and have the action call it. Prefer http over shell whenever
  the target has an API at all.
- A shell action MUST exit on its own. If it opens a socket or a device connection,
  call process.exit(0) after the work is done, or it hangs until the timeout kills it
  and looks like a failure even though it worked.`;
}

/**
 * A shell action must be a command line, not a program in a string. `node -e '…'`,
 * a heredoc, `python -c` — those work once and are impossible to read, diff or edit
 * afterwards. If logic is needed it belongs in a file on disk that the action calls.
 */
const INLINE_RUNTIME =
    /\b(?:node|bun|deno|python3?|ruby|perl|php|osascript)\s+(?:-e|-c|-p|--eval|--print)\b|<<\s*['"]?[A-Z_]+/;

function rejectInline(fn: ActionFn | null | undefined): string | null {
    if (!fn || fn.kind !== 'shell') return null;
    if (!INLINE_RUNTIME.test(fn.cmd)) return null;
    return [
        'That embeds a program inside the command (an inline -e/-c or a heredoc).',
        'Actions have to stay readable and editable, so a shell action must be a plain',
        'command line invoking something that already exists on disk.',
        '',
        'If the logic does not exist as a script or CLI yet, write one to a file first',
        '(somewhere sensible next to the code it belongs to), then make the action call',
        'that file. Prefer an http action over shell whenever the target has an API.',
    ].join('\n');
}

function extractJson(text: string): Draft | null {
    const cleaned = text
        .trim()
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/, '');
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
        return JSON.parse(cleaned.slice(start, end + 1)) as Draft;
    } catch {
        return null;
    }
}

export class ActionAuthor {
    /**
     * Draft, test and bind an action for a slot. Returns the row in whatever state it
     * reached: `ready` when a run succeeded, `failed` with the log when it didn't.
     * Progress is written to the row as it goes so the dial can show the slot building.
     */
    static async author(goal: string, slot: number): Promise<ActionData> {
        const action = await Action.create({
            label: 'Building…',
            kind: 'prompt',
            body: '',
            icon: 'refresh',
            slot,
            status: 'drafting',
            draft_log: `goal: ${goal}`,
        });

        const connection = await Settings.resolveConnection('plan_model');
        const client = clientFor(connection.baseUrl, connection.apiKey);
        // names only; values never reach the model
        const secretNames = (await Secret.listMeta())
            .filter((s) => !s.isPlaceholder)
            .map((s) => s.key);

        const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
            { role: 'system', content: systemPrompt(secretNames) },
            { role: 'user', content: goal },
        ];
        const logLines = [`goal: ${goal}`];
        let inspects = 0;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            let raw = '';
            try {
                const res = await client.chat.completions.create({
                    model: connection.model,
                    messages,
                    temperature: 0.2,
                });
                raw = res.choices[0]?.message?.content ?? '';
            } catch (err) {
                logLines.push(`attempt ${attempt}: model call failed`);
                log.error('model call failed', {
                    cause: err instanceof Error ? err.message : String(err),
                });
                break;
            }

            const draft = extractJson(raw);
            if (!draft) {
                logLines.push(`attempt ${attempt}: reply wasn't JSON`);
                messages.push({ role: 'assistant', content: raw.slice(0, 500) });
                messages.push({
                    role: 'user',
                    content: 'That was not JSON. Reply with only the JSON object.',
                });
                continue;
            }

            if (draft.read || draft.list) {
                if (inspects >= MAX_INSPECTS) {
                    messages.push({
                        role: 'user',
                        content: 'No more looking around. Draft the action now.',
                    });
                    attempt--; // reading isn't an attempt at making it work
                    continue;
                }
                inspects++;
                const target = draft.read ?? draft.list ?? '';
                const content = await inspect(draft);
                logLines.push(`read ${target}`);
                messages.push({ role: 'assistant', content: raw.slice(0, 300) });
                messages.push({ role: 'user', content: `${target}:\n${content}` });
                attempt--; // ditto
                continue;
            }

            const inlineComplaint = rejectInline(draft.fn);
            if (inlineComplaint) {
                logLines.push(`attempt ${attempt}: rejected, inline runtime`);
                messages.push({ role: 'assistant', content: raw.slice(0, 500) });
                messages.push({ role: 'user', content: inlineComplaint });
                continue;
            }

            const applied = await ActionAuthor.apply(action.id, draft, slot);
            if (!applied) {
                logLines.push(`attempt ${attempt}: draft had neither a usable template nor fn`);
                messages.push({ role: 'assistant', content: raw.slice(0, 500) });
                messages.push({
                    role: 'user',
                    content: 'That draft had nothing runnable. Give a template id, or an fn.',
                });
                continue;
            }

            // prompt/agent kinds have no request to verify; binding is the whole job
            if (applied.kind === 'prompt' || applied.kind === 'agent') {
                logLines.push(`attempt ${attempt}: bound as ${applied.kind} (nothing to test)`);
                return (
                    (await Action.update(action.id, {
                        status: 'ready',
                        draft_log: logLines.join('\n'),
                    })) ?? applied
                );
            }

            await Action.update(action.id, { status: 'testing' });
            const result = await Actions.execute(applied);
            logLines.push(
                `attempt ${attempt}: ${result.ok ? 'OK' : 'FAILED'} ${result.status ?? ''} ${result.output.slice(0, 300)}`.trim(),
            );

            if (result.ok) {
                log.info(`authored "${applied.label}" for slot ${slot} in ${attempt} attempt(s)`);
                return (
                    (await Action.update(action.id, {
                        status: 'ready',
                        draft_log: logLines.join('\n'),
                    })) ?? applied
                );
            }

            messages.push({ role: 'assistant', content: raw.slice(0, 500) });
            messages.push({
                role: 'user',
                content: `That ran and failed:\n${result.status ?? ''} ${result.output.slice(0, 800)}\n\nFix it and reply with the corrected JSON only.`,
            });
        }

        log.warn(`could not author an action for slot ${slot}`);
        return (
            (await Action.update(action.id, {
                label: 'Failed',
                icon: 'lock',
                status: 'failed',
                draft_log: logLines.join('\n'),
            })) ?? action
        );
    }

    /** Write a draft onto the row, either from a template or as authored. */
    private static async apply(id: string, draft: Draft, slot: number): Promise<ActionData | null> {
        if (draft.template && getTemplate(draft.template)) {
            const t = getTemplate(draft.template)!;
            const r = await Actions.fromTemplate(t.id, {
                slot,
                label: draft.label,
                params: draft.params ?? {},
            });
            if (!r.action) return null;
            // fromTemplate made its own row; fold it onto the one the dial is watching
            await Action.remove(r.action.id);
            return Action.update(id, {
                label: r.action.label,
                icon: r.action.icon,
                kind: r.action.kind,
                body: r.action.body,
                fn: r.action.fn,
                provider: r.action.provider,
                template_id: r.action.template_id,
                params: r.action.params,
                confirm: r.action.confirm,
                slot,
            });
        }

        const kind = draft.kind ?? (draft.fn ? draft.fn.kind : undefined);
        if (!kind) return null;
        if ((kind === 'http' || kind === 'shell') && !draft.fn) return null;
        if ((kind === 'prompt' || kind === 'agent') && !draft.body?.trim()) return null;

        return Action.update(id, {
            label: (draft.label ?? 'Action').slice(0, 14),
            icon: draft.icon ?? 'zap',
            kind,
            fn: draft.fn ?? null,
            body: draft.body ?? '',
            confirm: draft.confirm ?? false,
            slot,
        });
    }
}
