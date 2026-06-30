import type { MagmaMessageType, MagmaImage } from '@pompeii-labs/magma/types';
import { Message } from '../models/message';
import type { AttachmentRef } from '../models/message';
import { countTokens } from './tokens';
import { getContextWindow } from './context';
import { Settings } from '../models/settings';
import { Compaction } from '../models/compaction';

type Magma = MagmaMessageType;

/** Fold the read-time context if it exceeds this fraction of the model window.
 *  Above the background COMPACT_TRIGGER_RATIO (0.75) so it only fires on a
 *  window shrink (a model switch), not in normal operation. */
const EMERGENCY_RATIO = 0.9;

/** Cold-start look-back when no compaction watermark exists yet. */
const COLD_START_WINDOW = 2000;

/** Hydrate image attachments only for this many trailing messages; older images
 *  are dropped from context so they don't re-inflate every prompt. */
const IMAGE_RECENCY_ROWS = 8;

export interface RowMapOpts {
    /** Build a Magma image block for an image attachment, or null to skip it.
     *  Lets the caller choose URL vs base64; the pure mapper stays transport-free. */
    imageBlock?: (ref: AttachmentRef) => MagmaImage | null;
}

function asResult(result: unknown): string | Record<string, unknown> {
    if (result == null) return '';
    if (typeof result === 'string') return result;
    if (typeof result === 'object' && !Array.isArray(result)) {
        return result as Record<string, unknown>;
    }
    return JSON.stringify(result);
}

function asArgs(args: unknown): Record<string, unknown> {
    return args && typeof args === 'object' && !Array.isArray(args)
        ? (args as Record<string, unknown>)
        : {};
}

/** A turn carrying tool blocks must stay a distinct, adjacent anchor (the
 *  tool_call/tool_result pairing depends on it), so it can't be coalesced. */
function hasToolBlocks(msg: Magma): boolean {
    return (msg.blocks ?? []).some((b) => b.type === 'tool_call' || b.type === 'tool_result');
}

/** Merge a run of same-role plain turns into one. Text turns join with newlines;
 *  if any turn has blocks (images), flatten everything into one blocks array. */
function mergeRun(role: Magma['role'], run: Magma[]): Magma {
    if (run.length === 1) return run[0];
    const anyBlocks = run.some((m) => (m.blocks?.length ?? 0) > 0);
    if (!anyBlocks) {
        return {
            role,
            content: run
                .map((m) => m.content)
                .filter(Boolean)
                .join('\n'),
        } as Magma;
    }
    const blocks: NonNullable<Magma['blocks']> = [];
    for (const m of run) {
        if (m.content) blocks.push({ type: 'text', text: m.content });
        for (const b of m.blocks ?? []) blocks.push(b);
    }
    return { role, blocks } as Magma;
}

/** Collapse consecutive same-role plain turns. Tool-bearing turns pass through
 *  untouched so call/result pairs stay adjacent. */
export function coalesce(messages: Magma[]): Magma[] {
    const out: Magma[] = [];
    let i = 0;
    while (i < messages.length) {
        const head = messages[i];
        if (hasToolBlocks(head)) {
            out.push(head);
            i += 1;
            continue;
        }
        let j = i + 1;
        while (
            j < messages.length &&
            messages[j].role === head.role &&
            !hasToolBlocks(messages[j])
        ) {
            j += 1;
        }
        out.push(mergeRun(head.role, messages.slice(i, j)));
        i = j;
    }
    return out;
}

/**
 * Pure mapping of persisted rows to Magma messages. Single-user, so human turns
 * are plain `user` content (no `[name]:` prefix). Agent text becomes assistant
 * turns; each tool_call becomes a paired assistant `tool_call` + user
 * `tool_result` (same id) so Magma keeps the pair.
 */
export function rowsToSessionMessages(rows: Message[], opts: RowMapOpts = {}): Magma[] {
    const messages: Magma[] = [];

    for (const row of rows) {
        const type = row.type ?? 'message';

        // A panel interaction: a user turn whose content is already labeled
        // `[interaction] ...`, so Nero reads it as an event, not chat.
        if (type === 'interaction') {
            if (row.content) messages.push({ role: 'user', content: row.content } as Magma);
            continue;
        }

        if (type === 'message') {
            const images = (row.attachments ?? []).filter((a) => a.mime.startsWith('image/'));
            const hydrated: MagmaImage[] = [];
            const truncated: AttachmentRef[] = [];
            for (const a of images) {
                const block = opts.imageBlock ? opts.imageBlock(a) : null;
                if (block) hydrated.push(block);
                else truncated.push(a);
            }
            // An image is sent through the model once (while recent), then its data
            // is dropped from history and replaced with a reference note so the model
            // keeps continuity (and can re-fetch via the file id) without re-ingesting
            // megabytes of base64 every turn.
            const notes = truncated
                .map((a) => `[image "${a.name}" omitted from context to save tokens; ref ${a.id}]`)
                .join('\n');
            const text = [row.content, notes].filter(Boolean).join('\n');

            if (!text && hydrated.length === 0) continue;
            if (hydrated.length > 0) {
                messages.push({
                    role: 'user',
                    blocks: [
                        { type: 'text', text },
                        ...hydrated.map((image) => ({ type: 'image' as const, image })),
                    ],
                } as Magma);
            } else {
                messages.push({ role: 'user', content: text } as Magma);
            }
            continue;
        }

        if (type === 'agent_text') {
            if (!row.content) continue;
            messages.push({ role: 'assistant', content: row.content } as Magma);
            continue;
        }

        if (type === 'tool_call') {
            const meta = (row.metadata ?? {}) as Record<string, unknown>;
            const id = String(meta.tool_id ?? row.id);
            const fnName = (typeof meta.fn_name === 'string' && meta.fn_name) || 'tool';
            const call = { id, fn_name: fnName, fn_args: asArgs(meta.args) };
            messages.push({
                role: 'assistant',
                blocks: [{ type: 'tool_call', tool_call: call }],
            } as Magma);
            messages.push({
                role: 'user',
                blocks: [
                    {
                        type: 'tool_result',
                        tool_result: {
                            id,
                            fn_name: fnName,
                            result: asResult(meta.result),
                            error: meta.status === 'error',
                            call,
                        },
                    },
                ],
            } as Magma);
            continue;
        }
    }

    return coalesce(messages);
}

/** Render one message to plain text for summarization / token counting. */
export function messageToText(msg: Magma): string {
    if (msg.content) return msg.content;
    const parts: string[] = [];
    for (const block of msg.blocks ?? []) {
        if (block.type === 'text') parts.push(block.text);
        else if (block.type === 'tool_call') {
            parts.push(
                `[tool ${block.tool_call.fn_name} ${JSON.stringify(block.tool_call.fn_args)}]`,
            );
        } else if (block.type === 'tool_result') {
            const r = block.tool_result.result;
            parts.push(`[result ${typeof r === 'string' ? r : JSON.stringify(r)}]`);
        } else if (block.type === 'image') {
            parts.push('[image]');
        }
    }
    return parts.join('\n');
}

/** Hard-truncate a message's text to a token budget. Last resort only. */
function truncateMessage(msg: Magma, tokenBudget: number): Magma {
    const charBudget = Math.max(1, Math.floor(tokenBudget * 4));
    const text = messageToText(msg);
    const clipped = text.length > charBudget ? text.slice(0, charBudget) : text;
    return { role: msg.role, content: clipped || '…' } as Magma;
}

/** Deterministic, non-LLM fallback to force a message array under `budget`
 *  tokens. Preserves the leading summary and newest tail; drops the oldest. */
export function trimToBudget(messages: Magma[], budget: number, hasSummary: boolean): Magma[] {
    if (messages.length === 0) return messages;

    const summaryMsg = hasSummary ? messages[0] : null;
    const body = hasSummary ? messages.slice(1) : messages;

    const summaryTokens = summaryMsg ? countTokens(messageToText(summaryMsg)) : 0;
    if (summaryMsg && summaryTokens >= budget) {
        return [truncateMessage(summaryMsg, Math.max(budget, 1))];
    }

    let remaining = budget - summaryTokens;
    const kept: Magma[] = [];
    for (let i = body.length - 1; i >= 0; i--) {
        const t = countTokens(messageToText(body[i]));
        if (t <= remaining) {
            kept.unshift(body[i]);
            remaining -= t;
        } else if (kept.length === 0) {
            kept.unshift(truncateMessage(body[i], remaining));
            break;
        } else {
            break;
        }
    }

    return summaryMsg ? [summaryMsg, ...kept] : kept;
}

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
function toMagmaImageType(mime: string): MagmaImage['type'] {
    return (IMAGE_TYPES.has(mime) ? mime : 'image/png') as MagmaImage['type'];
}

/**
 * Reconstruct the conversation into Magma messages: stored compaction summary
 * (if any) + messages since its watermark. Image attachments are resolved to
 * base64 blocks via `loadImage` (so the model sees them without a public URL).
 * On overflow it trims deterministically to fit.
 */
export async function buildSessionMessages(
    opts: {
        loadImage?: (ref: AttachmentRef) => Promise<{ mime: string; base64: string } | null>;
        /** Cap the assembled tail to the most recent N messages. Used by voice to
         *  keep prefill (and thus time-to-first-token) bounded regardless of how
         *  much un-compacted history has accumulated. */
        tailLimit?: number;
    } = {},
): Promise<Magma[]> {
    const comp = await Compaction.getLatest();
    const rows = await Message.getSessionHistory({
        since: opts.tailLimit ? undefined : comp?.through_at,
        limit: opts.tailLimit ?? (comp ? undefined : COLD_START_WINDOW),
    });

    // Only hydrate images from the most recent turns. Re-sending every historical
    // image as base64 on every turn balloons the prompt (a handful of screenshots
    // = millions of tokens) and tanks latency; older image refs resolve to null and
    // are dropped by the mapper. Recent images (the ones being discussed) stay.
    const imageById = new Map<string, MagmaImage>();
    if (opts.loadImage) {
        const recent = rows.slice(-IMAGE_RECENCY_ROWS);
        const refs = recent.flatMap((r) =>
            (r.attachments ?? []).filter((a) => a.mime.startsWith('image/')),
        );
        await Promise.all(
            refs.map(async (ref) => {
                const img = await opts.loadImage!(ref);
                if (img)
                    imageById.set(ref.id, { type: toMagmaImageType(img.mime), data: img.base64 });
            }),
        );
    }

    const mapped = rowsToSessionMessages(rows, {
        imageBlock: (ref) => imageById.get(ref.id) ?? null,
    });
    const out: Magma[] = comp?.summary
        ? [
              {
                  role: 'assistant',
                  content: `[Summary of earlier conversation]\n${comp.summary}`,
              } as Magma,
              ...mapped,
          ]
        : mapped;

    const window = await getContextWindow(await Settings.resolveModel());
    const budget = window * EMERGENCY_RATIO;
    const tokens = out.reduce((sum, m) => sum + countTokens(messageToText(m)), 0);
    if (tokens <= budget) return out;
    return trimToBudget(out, budget, Boolean(comp?.summary));
}
