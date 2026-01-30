import { Model } from './base.js';

export interface MemoryData {
    id: number;
    body: string;
    related_to: number[];
    created_at: Date;
}

export class Memory extends Model<MemoryData> implements MemoryData {
    body!: string;
    related_to!: number[];
    created_at!: Date;

    static override tableName = 'memories';

    static async getRecent(limit: number): Promise<Memory[]> {
        return Memory.list({
            orderBy: { column: 'created_at', direction: 'DESC' },
            limit,
        });
    }
}
