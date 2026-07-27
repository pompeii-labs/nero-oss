import { Action, type ActionData, type ActionOutput } from '../../models/action';
import { Panel } from '../../models/panel';
import { Device } from '../../models/device';
import { Presence } from '../../models/presence';
import type { PanelFn } from '../../models/panel';
import { Secret } from '../../models/secret';
import { runFn, type FnResult } from '../panels/exec';
import { Dispatcher } from '../harness/dispatch';
import { fillFn, fillParams, getTemplate, resolveParams, stageMissing } from './catalog';
import { Logger } from '@nero/shared/logger';

const log = new Logger('actions');

/** A PanelFn minus `js`. Actions run http and shell only. */
type RunnableFn = Extract<PanelFn, { kind: 'shell' } | { kind: 'http' }>;

/** A script gets a hard ceiling. A dial press is a gesture, not a job: anything
 *  longer belongs in a project. */
const SCRIPT_TIMEOUT_MS = 30_000;
const OUTPUT_LIMIT = 4_000;

/**
 * Strip any injected secret value out of command output. A script is free to `echo
 * $LIFX_API_KEY`, deliberately or by accident (curl -v prints headers), and the result
 * goes back to the model and the browser. Short values are skipped: redacting a
 * two-character secret would mangle unrelated text.
 */
function redact(text: string, vault: Record<string, string>): string {
    let out = text;
    for (const value of Object.values(vault)) {
        if (value.length < 6) continue;
        out = out.split(value).join('[redacted]');
    }
    return out;
}

/** Render a run for a human: the dial flashes this, and the authoring loop reads it
 *  back to diagnose a failure. Keeps stderr and the exit code, which a bare status
 *  number would lose. */
function format(r: FnResult, kind: 'shell' | 'http'): string {
    const body = typeof r.raw === 'string' ? r.raw.trimEnd() : JSON.stringify(r.raw ?? '');
    const parts: string[] = [];
    if (!r.ok && kind === 'http') parts.push(`HTTP ${r.status}`);
    if (body) parts.push(body);
    if (r.stderr) parts.push(`[stderr]\n${r.stderr.trimEnd()}`);
    if (r.timedOut) parts.push('[hung: killed at the timeout, it never exited on its own]');
    else if (!r.ok && kind === 'shell') parts.push(`[exit ${r.status}]`);
    return parts.join('\n') || '(no output)';
}

/** `auto` picks by shape: one short line is a flash, anything longer wants somewhere
 *  to live. A press that returns nothing says nothing. */
function resolveOutput(mode: ActionOutput, text: string): Exclude<ActionOutput, 'auto'> {
    if (mode !== 'auto') return mode;
    const trimmed = text.trim();
    if (!trimmed) return 'silent';
    return trimmed.includes('\n') || trimmed.length > 140 ? 'panel' : 'flash';
}

/** Put a run's output on a screen, as monospace, so `df -H` stays readable. */
async function toPanel(action: ActionData, text: string): Promise<void> {
    // wherever Nero currently is; a panel on a screen he isn't on helps nobody
    const here = await Presence.get().catch(() => null);
    const device = (await Device.listOnline().catch(() => [])).find((d) => d.id === here);
    if (!device) return;
    await Panel.open({
        device_id: device.id,
        title: action.label,
        components: [{ type: 'code', value: text }],
        w: 520,
        h: 340,
    }).catch(() => {});
}

export interface ActionResult {
    /** False when the request failed, the command exited non-zero, or it couldn't run. */
    ok: boolean;
    /** HTTP status or shell exit code, when there was one. */
    status?: number;
    /** Shown on the dial as a brief flash under the wedge. */
    output: string;
    /** Set for `builtin`: the key the Field should handle locally. */
    builtin?: string;
    /** How the client should present `output`. Resolved from the action's mode. */
    present?: Exclude<ActionOutput, 'auto'>;
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

    /**
     * Turn a catalogue template into a real action. Params are baked in; `${SECRET}`
     * refs are left alone so the credential resolves per run and never lands in a row.
     * A template whose secrets are missing is still created — it stages them and
     * comes back `failed`, so the slot shows you what it's waiting on instead of
     * silently doing nothing.
     */
    static async fromTemplate(
        templateId: string,
        opts: { slot?: number; label?: string; params?: Record<string, string> } = {},
    ): Promise<{ action?: ActionData; error?: string; missingSecrets?: string[] }> {
        const template = getTemplate(templateId);
        if (!template) return { error: `no template "${templateId}"` };

        const { params, missing } = resolveParams(template, opts.params ?? {});
        if (missing.length) return { error: `missing required params: ${missing.join(', ')}` };

        const missingSecrets = await stageMissing(template);

        const action = await Action.create({
            label: (opts.label ?? template.label).trim(),
            icon: template.icon,
            kind: template.kind,
            body: template.body ? fillParams(template.body, params) : '',
            fn: template.fn ? fillFn(template.fn, params) : null,
            provider: template.provider,
            template_id: template.id,
            params,
            confirm: template.confirm ?? false,
            slot: opts.slot ?? -1,
            status: missingSecrets.length ? 'failed' : 'ready',
            draft_log: missingSecrets.length ? `waiting on ${missingSecrets.join(', ')}` : '',
        });

        return { action, missingSecrets: missingSecrets.length ? missingSecrets : undefined };
    }

    static async run(id: string): Promise<ActionResult> {
        const action = await Action.get(id);
        if (!action) return { ok: false, output: 'no such action' };

        await Action.touch(id);

        if (action.kind === 'builtin') {
            return { ok: true, output: '', builtin: action.body };
        }

        // prompt hands Nero one turn; agent hands him a goal to work as a loop
        if (action.kind === 'prompt' || action.kind === 'agent') {
            if (!action.body.trim()) return { ok: false, output: 'nothing configured yet' };
            await Dispatcher.start({ text: action.body, errand: action.kind === 'agent' });
            return { ok: true, output: 'sent' };
        }

        return Actions.execute(action);
    }

    /**
     * Fire an action's executable form. Split out so the authoring loop can test a
     * draft the same way a dial press runs the real thing.
     */
    static async execute(action: ActionData): Promise<ActionResult> {
        // The vault is injected so a request can authenticate ($LIFX_API_KEY and
        // friends) without the value ever landing in the stored action, which Nero
        // writes and can read back.
        const vault = await Secret.loadMap();
        const fn = Actions.toFn(action);
        if (!fn) return { ok: false, output: 'action has nothing to run' };

        try {
            const r = await runFn(fn, vault, SCRIPT_TIMEOUT_MS);
            log.info(`ran "${action.label}" (${r.ok ? 'ok' : 'failed'} ${r.status ?? ''})`);
            const output = redact(format(r, fn.kind), vault).slice(0, OUTPUT_LIMIT);
            // a failure always surfaces, whatever the mode says
            const present = r.ok ? resolveOutput(action.output, output) : 'flash';
            if (present === 'panel') await toPanel(action, output);
            return { ok: r.ok, status: r.status, output, present };
        } catch (err) {
            log.error(`action "${action.label}" failed`, {
                cause: err instanceof Error ? err.message : String(err),
            });
            return { ok: false, output: err instanceof Error ? err.message : 'failed' };
        }
    }

    /** The runnable form. `fn` is authoritative; a legacy row that only has `body`
     *  (written when a shell action stored its command there) still runs.
     *  Narrowed to exclude `js` — panels may run it, dial actions never do. */
    static toFn(action: ActionData): RunnableFn | null {
        if (action.fn) {
            return action.fn.kind === 'shell'
                ? { kind: 'shell', cmd: action.fn.cmd }
                : {
                      kind: 'http',
                      url: action.fn.url,
                      method: action.fn.method,
                      headers: action.fn.headers,
                      body: action.fn.body,
                  };
        }
        if (action.kind === 'shell' && action.body.trim()) {
            return { kind: 'shell', cmd: action.body };
        }
        return null;
    }
}
