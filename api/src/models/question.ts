import { DataModel } from './datamodel';

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

export interface QuestionData {
    id: string;
    items: AskItem[];
    answers: (string[] | null)[] | null;
    status: AskStatus;
    dispatch_id: string | null;
    created_at: number;
}

/** An ask Nero is blocked on: one or more questions, answered together. `answers`
 *  is parallel to `items`, each entry the chosen label(s) for that question. */
export class Question extends DataModel<QuestionData> {
    static readonly tableName = 'questions';
    static readonly stampUpdatedAt = true;

    items!: AskItem[];
    answers!: (string[] | null)[] | null;
    status!: AskStatus;
    dispatch_id!: string | null;
    created_at!: number;

    constructor(data: QuestionData) {
        super();
        Object.assign(this, data);
    }

    static async resolve(
        id: string,
        status: AskStatus,
        answers: (string[] | null)[] | null,
    ): Promise<void> {
        // `answers` is a JSON column and null serializes to '' on the write path, which
        // Lux rejects. A dismissal has no answers, so store the empty list.
        await Question.update(id, { status, answers: answers ?? [] });
    }

    /** On boot, mark any still-pending ask as cancelled (its waiter died with the
     *  previous process). Mirrors dispatch orphan cleanup. */
    static async cancelOrphans(): Promise<number> {
        const rows = await Question.list({ column: 'status', operator: 'eq', value: 'pending' });
        for (const r of rows) await Question.resolve(r.id, 'cancelled', null);
        return rows.length;
    }
}
