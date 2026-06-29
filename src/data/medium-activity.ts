import { getLux, unwrap } from '../lux/client';
import type { MediumActivity } from '../lux/types';

export interface ActivityRow {
    id: string;
    medium: string;
    title: string;
    body: string;
    urgency: string;
    status: string;
    error: string | null;
    createdAt: number;
}

/** Audit one delivery attempt (sent or error). */
export async function log(input: {
    medium: string;
    title: string;
    body: string;
    urgency: string;
    status: string;
    error?: string;
}): Promise<void> {
    unwrap(
        await getLux()
            .table('medium_activity')
            .insert({ ...input, error: input.error ?? null } as never),
    );
}

export async function recent(limit = 20): Promise<ActivityRow[]> {
    const rows = unwrap(
        await getLux()
            .table('medium_activity')
            .select()
            .order('created_at', { ascending: false })
            .limit(limit),
    ) as MediumActivity[];
    return rows.map((r) => ({
        id: r.id,
        medium: r.medium ?? '',
        title: r.title ?? '',
        body: r.body ?? '',
        urgency: r.urgency ?? 'normal',
        status: r.status ?? 'sent',
        error: r.error ?? null,
        createdAt: r.created_at ?? 0,
    }));
}
