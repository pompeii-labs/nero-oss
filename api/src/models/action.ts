import { getLux, unwrap } from '@nero/shared/lux';
import { randomUUID } from 'crypto';

/**
 * An action: one thing the user can fire from a slot on the orb's radial menu.
 * Three kinds share one row:
 *   - `builtin` — a capability the Field already owns (voice, wakeword, theme).
 *     `body` is the builtin key; the server never runs it, the client does.
 *   - `script`  — a shell script Nero (or the user) authored. Runs through the
 *     runner, same surface as the bash tool.
 *   - `prompt`  — a message handed to Nero as if the user had typed it.
 *
 * Slots are the eight compass positions on the dial, 0 at twelve o'clock going
 * clockwise. `slot` -1 means the action exists but isn't bound to the dial.
 * Direct-Lux with a lazy ensure, like Pursuit.
 */

export type ActionKind = 'builtin' | 'script' | 'prompt';

export const SLOTS = 8;

export interface ActionData {
    id: string;
    /** 0-7 clockwise from twelve o'clock, or -1 for unbound. */
    slot: number;
    label: string;
    /** Icon key the Field maps to a glyph. */
    icon: string;
    kind: ActionKind;
    /** builtin key, shell script, or prompt text depending on `kind`. */
    body: string;
    /** Require a confirm tap before firing. For anything destructive. */
    confirm: boolean;
    /** Working directory for `script` actions. Empty = the runner's default. */
    cwd: string;
    /** Epoch ms of the last run (0 = never). */
    last_run_at: number;
    created_at: number;
    updated_at: number;
}

const TABLE = 'actions';

export class Action {
    private static ensured = false;
    static async ensure(): Promise<void> {
        if (Action.ensured) return;
        await getLux().createTable(TABLE, [
            { name: 'id', type: 'STR', primaryKey: true },
            { name: 'slot', type: 'INT' },
            { name: 'label', type: 'STR' },
            { name: 'icon', type: 'STR' },
            { name: 'kind', type: 'STR' },
            { name: 'body', type: 'STR' },
            { name: 'confirm', type: 'BOOL' },
            { name: 'cwd', type: 'STR' },
            { name: 'last_run_at', type: 'INT' },
            { name: 'created_at', type: 'INT' },
            { name: 'updated_at', type: 'INT' },
        ]);
        Action.ensured = true;
    }

    static async list(): Promise<ActionData[]> {
        try {
            return unwrap(
                await getLux().table(TABLE).select().order('slot', { ascending: true }),
            ) as unknown as ActionData[];
        } catch {
            return [];
        }
    }

    static async get(id: string): Promise<ActionData | null> {
        try {
            const rows = unwrap(
                await getLux().table(TABLE).select().eq('id', id).limit(1),
            ) as unknown as ActionData[];
            return rows[0] ?? null;
        } catch {
            return null;
        }
    }

    /** The action bound to a dial slot, if any. */
    static async atSlot(slot: number): Promise<ActionData | null> {
        try {
            const rows = unwrap(
                await getLux().table(TABLE).select().eq('slot', slot).limit(1),
            ) as unknown as ActionData[];
            return rows[0] ?? null;
        } catch {
            return null;
        }
    }

    static async create(
        input: Partial<ActionData> & Pick<ActionData, 'label' | 'kind' | 'body'>,
    ): Promise<ActionData> {
        await Action.ensure();
        const now = Date.now();
        const row: ActionData = {
            id: randomUUID(),
            slot: input.slot ?? -1,
            label: input.label.trim(),
            icon: input.icon?.trim() || 'zap',
            kind: input.kind,
            body: input.body,
            confirm: input.confirm ?? false,
            cwd: input.cwd ?? '',
            last_run_at: 0,
            created_at: now,
            updated_at: now,
        };
        if (row.slot >= 0) await Action.clearSlot(row.slot);
        unwrap(
            await getLux()
                .table(TABLE)
                .insert(row as never),
        );
        return row;
    }

    static async update(id: string, patch: Partial<ActionData>): Promise<ActionData | null> {
        const existing = await Action.get(id);
        if (!existing) return null;
        const row: ActionData = { ...existing, ...patch, id, updated_at: Date.now() };
        if (row.slot >= 0 && row.slot !== existing.slot) await Action.clearSlot(row.slot, id);
        unwrap(
            await getLux()
                .table(TABLE)
                .update(row as never)
                .eq('id', id),
        );
        return row;
    }

    /** Unbind whatever currently holds a slot so two actions never share one. */
    private static async clearSlot(slot: number, exceptId?: string): Promise<void> {
        const held = await Action.atSlot(slot);
        if (!held || held.id === exceptId) return;
        unwrap(
            await getLux()
                .table(TABLE)
                .update({ ...held, slot: -1, updated_at: Date.now() } as never)
                .eq('id', held.id),
        );
    }

    static async remove(id: string): Promise<void> {
        unwrap(await getLux().table(TABLE).delete().eq('id', id));
    }

    static async touch(id: string): Promise<void> {
        const existing = await Action.get(id);
        if (!existing) return;
        unwrap(
            await getLux()
                .table(TABLE)
                .update({ ...existing, last_run_at: Date.now() } as never)
                .eq('id', id),
        );
    }
}
