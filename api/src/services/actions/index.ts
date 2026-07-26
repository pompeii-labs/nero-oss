import { Action, type ActionData } from '../../models/action';
import { runShell, formatShell } from '../../tools/shell';
import { Dispatcher } from '../harness/dispatch';
import { Logger } from '@nero/shared/logger';

const log = new Logger('actions');

/** A script gets a hard ceiling. A dial press is a gesture, not a job: anything
 *  longer belongs in a project. */
const SCRIPT_TIMEOUT_MS = 30_000;
const OUTPUT_LIMIT = 4_000;

export interface ActionResult {
    /** False when the script exited non-zero or the action could not run. */
    ok: boolean;
    /** Shown on the dial as a brief flash under the wedge. */
    output: string;
    /** Set for `builtin`: the key the Field should handle locally. */
    builtin?: string;
}

/**
 * Firing a slot. `builtin` actions never execute here (the capability lives in the
 * browser), so the server just names the key back and the Field runs it. `script`
 * shells out through the runner; `prompt` hands text to Nero as a normal turn.
 */
export class Actions {
    static list(): Promise<ActionData[]> {
        return Action.list();
    }

    static get(id: string): Promise<ActionData | null> {
        return Action.get(id);
    }

    static create(
        input: Partial<ActionData> & Pick<ActionData, 'label' | 'kind' | 'body'>,
    ): Promise<ActionData> {
        return Action.create(input);
    }

    static update(id: string, patch: Partial<ActionData>): Promise<ActionData | null> {
        return Action.update(id, patch);
    }

    static remove(id: string): Promise<void> {
        return Action.remove(id);
    }

    /** Bind an action to a dial slot (0-7), or -1 to unbind it. */
    static assign(id: string, slot: number): Promise<ActionData | null> {
        return Action.update(id, { slot });
    }

    static async run(id: string): Promise<ActionResult> {
        const action = await Action.get(id);
        if (!action) return { ok: false, output: 'no such action' };

        await Action.touch(id);

        if (action.kind === 'builtin') {
            return { ok: true, output: '', builtin: action.body };
        }

        if (action.kind === 'prompt') {
            await Dispatcher.start({ text: action.body });
            return { ok: true, output: 'sent' };
        }

        try {
            const r = await runShell(action.body, {
                timeoutMs: SCRIPT_TIMEOUT_MS,
                cwd: action.cwd || undefined,
            });
            log.info(`ran "${action.label}" (exit ${r.code})`);
            return { ok: r.code === 0, output: formatShell(r).slice(0, OUTPUT_LIMIT) };
        } catch (err) {
            log.error(`action "${action.label}" failed`, {
                cause: err instanceof Error ? err.message : String(err),
            });
            return { ok: false, output: err instanceof Error ? err.message : 'failed' };
        }
    }
}
