import { DataModel } from './datamodel';
import { getLux, unwrap } from '../lib/lux';
import type { Compaction as CompactionRow } from '../lux/types';

export interface CompactionData {
    id: string;
    summary: string;
    /** Watermark = id of the last folded message. Rows with id <= through_at are
     *  represented by `summary`; the session only loads id > through_at. */
    through_at: number;
    created_at: number;
}

export class Compaction extends DataModel<CompactionData> {
    static readonly tableName = 'compaction';

    summary!: string;
    through_at!: number;
    created_at!: number;

    constructor(data: CompactionData) {
        super();
        Object.assign(this, data);
    }

    /** Latest compaction summary, or null if the thread has never been folded. We
     *  append a new row per fold (cheap, single-user); the newest always wins. */
    static async getLatest(): Promise<Compaction | null> {
        const rows = unwrap(
            await getLux()
                .table('compaction')
                .select()
                .order('created_at', { ascending: false })
                .limit(1),
        ) as CompactionRow[];
        return rows.length ? new Compaction(rows[0] as unknown as CompactionData) : null;
    }
}
