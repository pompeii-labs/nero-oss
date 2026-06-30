import { DataModel } from './datamodel';
import { getLux, unwrap } from '../lib/lux';
import type { MediumActivity as MediumActivityRow } from '../lux/types';

export interface MediumActivityData {
    id: string;
    medium: string;
    title: string;
    body: string;
    urgency: string;
    status: string;
    error: string | null;
    created_at: number;
}

export class MediumActivity extends DataModel<MediumActivityData> {
    static readonly tableName = 'medium_activity';

    medium!: string;
    title!: string;
    body!: string;
    urgency!: string;
    status!: string;
    error!: string | null;
    created_at!: number;

    constructor(data: MediumActivityData) {
        super();
        Object.assign(this, data);
    }

    /** Audit one delivery attempt (sent or error). */
    static async log(input: {
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

    static async recent(limit = 20): Promise<MediumActivity[]> {
        const rows = unwrap(
            await getLux()
                .table('medium_activity')
                .select()
                .order('created_at', { ascending: false })
                .limit(limit),
        ) as MediumActivityRow[];
        return rows.map((r) => new MediumActivity(r as unknown as MediumActivityData));
    }
}
