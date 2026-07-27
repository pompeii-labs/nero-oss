import { tool, toolparam } from '@pompeii-labs/magma/decorators';
import type { MagmaToolCall } from '@pompeii-labs/magma/types';
import type { MagmaAgent } from '@pompeii-labs/magma';
import { Args } from '../../util/args';
import { Actions } from './index';
import { ActionAuthor } from './author';
import { SLOTS, type ActionKind } from '../../models/action';
import { DEFAULT_ICON, ICON_LIST, isDialIcon } from './icons';

const SLOT_NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Lets Nero build the user a dial. He writes the script, names it, picks a glyph,
 *  and binds it to one of the eight positions around the orb. */
export class ActionsUtility {
    @tool({
        name: 'create_action',
        description:
            "Author a one-press action and bind it to a slot on the orb's radial dial. Use when the user wants a shortcut for something they do repeatedly (a script, a deploy, a status check, a canned request to you). Prefer `script` for anything you can do in shell; use `prompt` when the press should just start a conversation turn with you.",
    })
    @toolparam({
        key: 'label',
        type: 'string',
        required: true,
        description:
            'Short uppercase-friendly name shown under the glyph, e.g. "DEPLOY" or "STANDUP". Two words max.',
    })
    @toolparam({
        key: 'kind',
        type: 'string',
        required: true,
        description:
            'Either "shell" (run a command) or "prompt" (send yourself a message as if the user typed it).',
    })
    @toolparam({
        key: 'body',
        type: 'string',
        required: true,
        description: 'The shell script for kind=script, or the message text for kind=prompt.',
    })
    @toolparam({
        key: 'slot',
        type: 'number',
        required: false,
        description: `Dial position 0-${SLOTS - 1}, clockwise from twelve o'clock (0=N, 2=E, 4=S, 6=W). Omit to create it unbound. Binding a taken slot displaces whatever was there.`,
    })
    @toolparam({
        key: 'icon',
        type: 'string',
        required: false,
        description: `Glyph key, one of: ${ICON_LIST}. Pick the one that names the thing the action touches. Defaults to ${DEFAULT_ICON}.`,
    })
    @toolparam({
        key: 'cwd',
        type: 'string',
        required: false,
        description: 'Working directory for a script action. Defaults to the runner default.',
    })
    @toolparam({
        key: 'confirm',
        type: 'boolean',
        required: false,
        description: 'Require a second tap before firing. Set true for anything destructive.',
    })
    async create_action(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const a = new Args(call);
        const label = a.text('label');
        const kind = a.text('kind') as ActionKind;
        const body = a.str('body');
        if (!label) return 'Need a short label for the action.';
        if (kind !== 'shell' && kind !== 'prompt') return 'kind must be "shell" or "prompt".';
        if (!body.trim()) return 'Need the script (or prompt text) to run.';

        const slot = a.num('slot', -1);
        if (slot < -1 || slot >= SLOTS) return `slot must be -1 or 0-${SLOTS - 1}.`;
        const icon = a.text('icon', DEFAULT_ICON);

        const action = await Actions.create({
            label,
            kind,
            body,
            slot,
            icon: isDialIcon(icon) ? icon : DEFAULT_ICON,
            cwd: a.text('cwd'),
            confirm: a.bool('confirm'),
        });

        const where = slot >= 0 ? `slot ${slot} (${SLOT_NAMES[slot]})` : 'unbound (no dial slot)';
        return `Created action "${action.label}" at ${where}. Id ${action.id}.`;
    }

    @tool({
        name: 'list_actions',
        description:
            "List the user's dial actions and which slot each occupies. Use before binding a slot so you know what you'd displace.",
    })
    async list_actions(_call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const actions = await Actions.list();
        if (!actions.length)
            return 'No actions yet. The dial is showing only built-in capabilities.';
        return actions
            .map((x) => {
                const where = x.slot >= 0 ? `slot ${x.slot} ${SLOT_NAMES[x.slot]}` : 'unbound';
                return `${x.label} [${x.kind}] ${where} (id ${x.id})`;
            })
            .join('\n');
    }

    @tool({
        name: 'assign_action_slot',
        description: 'Move an existing action to a different dial slot, or unbind it with slot -1.',
    })
    @toolparam({ key: 'id', type: 'string', required: true, description: 'The action id.' })
    @toolparam({
        key: 'slot',
        type: 'number',
        required: true,
        description: `Dial position 0-${SLOTS - 1} clockwise from twelve o'clock, or -1 to unbind.`,
    })
    async assign_action_slot(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const a = new Args(call);
        const id = a.text('id');
        const slot = a.num('slot', -1);
        if (!id) return 'Need the action id.';
        if (slot < -1 || slot >= SLOTS) return `slot must be -1 or 0-${SLOTS - 1}.`;
        const updated = await Actions.assign(id, slot);
        if (!updated) return `No action with id ${id}.`;
        return slot >= 0
            ? `"${updated.label}" now sits at slot ${slot} (${SLOT_NAMES[slot]}).`
            : `"${updated.label}" is unbound from the dial.`;
    }

    @tool({
        name: 'delete_action',
        description: 'Delete a dial action for good.',
    })
    @toolparam({ key: 'id', type: 'string', required: true, description: 'The action id.' })
    async delete_action(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const id = new Args(call).text('id');
        if (!id) return 'Need the action id.';
        const existing = await Actions.get(id);
        if (!existing) return `No action with id ${id}.`;
        await Actions.remove(id);
        return `Deleted "${existing.label}".`;
    }

    @tool({
        name: 'run_action',
        description:
            "Fire one of the user's Dial buttons yourself. If they already have a button for something, press it rather than reaching for an MCP server or writing a one-off command: it's what they built and it's faster.",
    })
    @toolparam({
        key: 'action',
        type: 'string',
        required: true,
        description: 'The action id, or its label (case-insensitive), e.g. "Lights".',
    })
    async run_action(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const key = new Args(call).text('action');
        if (!key) return 'Need the action id or label.';

        const all = await Actions.list();
        const wanted = key.toLowerCase();
        const matches = all.filter((a) => a.id === key || a.label.toLowerCase() === wanted);
        if (!matches.length) {
            const known = all.map((a) => a.label).join(', ');
            return `No Dial action called "${key}".${known ? ` There is: ${known}.` : ''}`;
        }
        if (matches.length > 1) {
            return `More than one action is called "${key}". Use the id: ${matches
                .map((m) => `${m.label} (${m.id})`)
                .join(', ')}.`;
        }

        const r = await Actions.run(matches[0].id);
        if (r.builtin) return 'That slot is a built-in the screen owns; the user has to press it.';
        return r.ok ? r.output || 'Done.' : `Failed: ${r.output}`;
    }

    @tool({
        name: 'revise_action',
        description:
            'Change what an existing Dial button does, in place. Use this when the user wants one of their buttons fixed or altered - it keeps the same slot and survives a failed attempt, unlike deleting and rebuilding.',
    })
    @toolparam({
        key: 'action',
        type: 'string',
        required: true,
        description: 'The action id or its label.',
    })
    @toolparam({
        key: 'change',
        type: 'string',
        required: true,
        description: 'What should be different, in plain terms.',
    })
    async revise_action(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const a = new Args(call);
        const key = a.text('action');
        const change = a.text('change');
        if (!key || !change) return 'Need the action and what to change.';

        const all = await Actions.list();
        const wanted = key.toLowerCase();
        const found = all.find((x) => x.id === key || x.label.toLowerCase() === wanted);
        if (!found) return `No Dial action called "${key}".`;

        const revised = await ActionAuthor.author(change, found.slot, found.id);
        return revised.status === 'ready'
            ? `Revised "${revised.label}".`
            : `Couldn't revise it: ${revised.draft_log.slice(-300)}`;
    }
}
