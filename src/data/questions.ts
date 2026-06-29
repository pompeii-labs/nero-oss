import { getLux, unwrap } from '../lux/client';
import type { Questions } from '../lux/types';

export interface AskOption {
    label: string;
    description?: string;
}

/** One question within an ask. An ask can carry several. */
export interface AskItem {
    question: string;
    header?: string;
    options: AskOption[];
    multi?: boolean;
}

export type AskStatus = 'pending' | 'answered' | 'cancelled' | 'timeout';

/** An ask Nero is blocked on: one or more questions, answered together. `answers`
 *  is parallel to `items` — each entry is the chosen label(s) for that question. */
export interface QuestionSet {
    id: string;
    items: AskItem[];
    answers: (string[] | null)[] | null;
    status: AskStatus;
    createdAt: number;
}

function coerce(r: Questions): QuestionSet {
    return {
        id: r.id,
        items: (r.items as AskItem[] | null) ?? [],
        answers: (r.answers as (string[] | null)[] | null) ?? null,
        status: (r.status as AskStatus) ?? 'pending',
        createdAt: r.created_at ?? 0,
    };
}

export async function create(input: {
    items: AskItem[];
    dispatchId?: string;
}): Promise<QuestionSet> {
    const res = await getLux()
        .table('questions')
        .insert({
            items: input.items,
            dispatch_id: input.dispatchId ?? null,
            status: 'pending',
        } as never);
    return coerce(unwrap(res) as Questions);
}

export async function resolve(
    id: string,
    status: AskStatus,
    answers: (string[] | null)[] | null,
): Promise<void> {
    unwrap(
        await getLux()
            .table('questions')
            .update({ status, answers, updated_at: Date.now() } as never)
            .eq('id', id),
    );
}

export async function get(id: string): Promise<QuestionSet | null> {
    const rows = unwrap(
        await getLux().table('questions').select().eq('id', id).limit(1),
    ) as Questions[];
    return rows.length ? coerce(rows[0]) : null;
}

/** On boot, mark any still-pending ask as cancelled (its waiter died with the
 *  previous process). Mirrors dispatch orphan cleanup. */
export async function cancelOrphans(): Promise<number> {
    const rows = unwrap(
        await getLux().table('questions').select().eq('status', 'pending').limit(500),
    ) as Questions[];
    for (const r of rows) await resolve(r.id, 'cancelled', null);
    return rows.length;
}
