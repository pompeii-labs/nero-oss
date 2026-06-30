import { DataModel } from './datamodel';

export type DispatchStatus = 'thinking' | 'running' | 'compacting' | 'done' | 'error' | 'cancelled';

export interface DispatchActivity {
    id: string;
    tool: string;
    displayName?: string;
    args?: Record<string, unknown>;
    status: 'running' | 'success' | 'error';
    result?: string;
    error?: string;
}

export interface DispatchData {
    id: string;
    status: DispatchStatus;
    streaming_text: string;
    activities: DispatchActivity[];
    created_at: number;
    updated_at: number;
}

export class Dispatch extends DataModel<DispatchData> {
    static readonly tableName = 'dispatches';
    static readonly stampUpdatedAt = true;

    status!: DispatchStatus;
    streaming_text!: string;
    activities!: DispatchActivity[];
    created_at!: number;
    updated_at!: number;

    constructor(data: DispatchData) {
        super();
        Object.assign(this, data);
    }

    static start(): Promise<Dispatch> {
        return Dispatch.create({ status: 'thinking', streaming_text: '', activities: [] });
    }

    /** On boot, finalize any dispatch left mid-flight by a crashed/killed process.
     *  Single-flight means nothing can legitimately be running at start, so any
     *  non-terminal row is an orphan that would otherwise pin the UI in THINKING. */
    static async cancelOrphans(): Promise<number> {
        let n = 0;
        for (const status of ['thinking', 'running', 'compacting'] as const) {
            const rows = await Dispatch.list({ column: 'status', operator: 'eq', value: status });
            for (const r of rows) {
                await Dispatch.update(r.id, { status: 'cancelled' });
                n++;
            }
        }
        return n;
    }
}
