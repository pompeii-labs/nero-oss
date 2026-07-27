import { getLux, unwrap } from '@nero/shared/lux';
import { randomUUID } from 'crypto';

/**
 * An action: one thing the user can fire from a slot on the orb's radial menu.
 * One row, several kinds:
 *   - `builtin` — a capability the Field already owns (camera, stop). `body` is the
 *     builtin key; the server never runs it, the client does.
 *   - `http`    — a declarative request. Fires directly, no LLM turn, which is the
 *     whole point of a dial: an MCP round trip would leave you waiting on a model.
 *   - `shell`   — a command, run through the runner with the vault in its env.
 *   - `prompt`  — a message handed to Nero as if the user had typed it.
 *   - `agent`   — a goal run as an agent loop rather than a single turn (BRIEF).
 *
 * Slots are the eight compass positions on the dial, 0 at twelve o'clock going
 * clockwise. `slot` -1 means the action exists but isn't bound to the dial.
 * Direct-Lux with a lazy ensure, like Pursuit.
 */

export type ActionKind = 'builtin' | 'http' | 'shell' | 'prompt' | 'agent';

/** How an action executes. Mirrors PanelFn minus `js`, which actions never carry. */
export type ActionFn =
    | { kind: 'shell'; cmd: string }
    | {
          kind: 'http';
          url: string;
          method?: string;
          headers?: Record<string, string>;
          body?: string;
      };

/** Where an action is in its life. Nero authors in the background, so a slot can be
 *  occupied by something he's still building. */
export type ActionStatus = 'ready' | 'drafting' | 'testing' | 'failed';

/**
 * Where a run's output goes.
 *  - `auto`   pick by shape: a short line flashes, anything multi-line opens a panel.
 *  - `flash`  a brief line under the dial, then gone.
 *  - `panel`  a panel on the Field you can read and keep.
 *  - `speak`  read aloud (falls back to a flash outside a voice turn).
 *  - `silent` nothing. For a light switch, the room is the feedback.
 */
export type ActionOutput = 'auto' | 'flash' | 'panel' | 'speak' | 'silent';

export const SLOTS = 8;

export interface ActionData {
    id: string;
    /** 0-7 clockwise from twelve o'clock, or -1 for unbound. */
    slot: number;
    label: string;
    /** Icon key the Field maps to a glyph. */
    icon: string;
    kind: ActionKind;
    /** builtin key, prompt text, or agent goal. Empty for http/shell, which use `fn`. */
    body: string;
    /**
     * The executable form for http/shell. Holds `${SECRET}` references verbatim —
     * they resolve per run, so rotating a token doesn't orphan every action and the
     * value is never written to a row.
     */
    fn: ActionFn | null;
    /** Catalogue provenance, so a template can be re-instantiated or repaired. */
    provider: string;
    template_id: string;
    /** Param values baked in at instantiation (unlike secrets). */
    params: Record<string, string>;
    status: ActionStatus;
    output: ActionOutput;
    /** Newline log of the authoring loop's attempts; the error when `failed`. */
    draft_log: string;
    /** Require a confirm tap before firing. For anything destructive. */
    confirm: boolean;
    /** Working directory for `shell` actions. Empty = the runner's default. */
    cwd: string;
    /** Epoch ms of the last run (0 = never). */
    last_run_at: number;
    created_at: number;
    updated_at: number;
}

/** The stored shape. `fn` and `params` are JSON *strings*: Lux's createTable has no
 *  JSON type, and Pursuit already avoids JSON columns for the same reason. */
type ActionRow = Omit<ActionData, 'fn' | 'params'> & { fn: string; params: string };

function parse<T>(raw: unknown, fallback: T): T {
    if (typeof raw !== 'string' || !raw) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

/** Rows written before http/agent existed used `script` and lack the newer columns.
 *  Normalise on read so callers never see a half-shaped row. */
function hydrate(row: ActionRow): ActionData {
    return {
        ...row,
        kind: (row.kind as string) === 'script' ? 'shell' : row.kind,
        fn: parse<ActionFn | null>(row.fn, null),
        provider: row.provider ?? '',
        template_id: row.template_id ?? '',
        params: parse<Record<string, string>>(row.params, {}),
        status: row.status ?? 'ready',
        output: row.output ?? 'auto',
        draft_log: row.draft_log ?? '',
    };
}

function dehydrate(data: ActionData): ActionRow {
    return {
        ...data,
        fn: data.fn ? JSON.stringify(data.fn) : '',
        params: Object.keys(data.params).length ? JSON.stringify(data.params) : '',
    };
}

const TABLE = 'actions';

/** Columns added after the table first shipped. `createTable` is a no-op against an
 *  existing table and does NOT backfill columns, so an install that predates these
 *  needs them altered in. Both paths converge on the same schema. */
const ADDED_COLUMNS: [string, string][] = [
    ['fn', 'TEXT'],
    ['provider', 'TEXT'],
    ['template_id', 'TEXT'],
    ['params', 'TEXT'],
    ['status', 'TEXT'],
    ['output', 'TEXT'],
    ['draft_log', 'TEXT'],
];

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
            { name: 'fn', type: 'STR' },
            { name: 'provider', type: 'STR' },
            { name: 'template_id', type: 'STR' },
            { name: 'params', type: 'STR' },
            { name: 'status', type: 'STR' },
            { name: 'output', type: 'STR' },
            { name: 'draft_log', type: 'STR' },
            { name: 'confirm', type: 'BOOL' },
            { name: 'cwd', type: 'STR' },
            { name: 'last_run_at', type: 'INT' },
            { name: 'created_at', type: 'INT' },
            { name: 'updated_at', type: 'INT' },
        ]);
        // Idempotent: each fails harmlessly once the column is there.
        for (const [name, type] of ADDED_COLUMNS) {
            await getLux()
                .exec(`TALTER ${TABLE} ADD ${name} ${type}`)
                .catch(() => {});
        }
        Action.ensured = true;
    }

    static async list(): Promise<ActionData[]> {
        try {
            return (
                unwrap(
                    await getLux().table(TABLE).select().order('slot', { ascending: true }),
                ) as unknown as ActionRow[]
            ).map(hydrate);
        } catch {
            return [];
        }
    }

    static async get(id: string): Promise<ActionData | null> {
        try {
            const rows = unwrap(
                await getLux().table(TABLE).select().eq('id', id).limit(1),
            ) as unknown as ActionRow[];
            return rows[0] ? hydrate(rows[0]) : null;
        } catch {
            return null;
        }
    }

    /** The action bound to a dial slot, if any. */
    static async atSlot(slot: number): Promise<ActionData | null> {
        try {
            const rows = unwrap(
                await getLux().table(TABLE).select().eq('slot', slot).limit(1),
            ) as unknown as ActionRow[];
            return rows[0] ? hydrate(rows[0]) : null;
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
            fn: input.fn ?? null,
            provider: input.provider ?? '',
            template_id: input.template_id ?? '',
            params: input.params ?? {},
            status: input.status ?? 'ready',
            output: input.output ?? 'auto',
            draft_log: input.draft_log ?? '',
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
                .insert(dehydrate(row) as never),
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
                .update(dehydrate(row) as never)
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
                .update(dehydrate({ ...held, slot: -1, updated_at: Date.now() }) as never)
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
                .update(dehydrate({ ...existing, last_run_at: Date.now() }) as never)
                .eq('id', id),
        );
    }
}
