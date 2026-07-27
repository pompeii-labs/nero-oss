import { tool, toolparam } from '@pompeii-labs/magma/decorators';
import type { MagmaToolCall } from '@pompeii-labs/magma/types';
import type { MagmaAgent } from '@pompeii-labs/magma';
import { Args } from '../../util/args';
import { Action, type ActionFn } from '../../models/action';
import { Actions } from './index';

/**
 * The two tools that make a dial button real: fire a draft and see what happens, then
 * commit it to the slot. Everything else the authoring agent needs (reading source,
 * writing a script, recalling what it already knows) it already has from Nero's own
 * toolset.
 *
 * `test_action` is the important one. A button that was never pressed is a guess, and
 * for anything physical — lights, a speaker — running it is also how you find out.
 */

/** A shell action must be a command line, not a program in a string. Inline code
 *  works once and can never be read, diffed or edited afterwards. */
const INLINE_RUNTIME =
    /\b(?:node|bun|deno|python3?|ruby|perl|php|osascript)\s+(?:-e|-c|-p|--eval|--print)\b|<<\s*['"]?[A-Z_]+/;

const INLINE_COMPLAINT =
    'That embeds a program inside the command (an inline -e/-c or a heredoc). A shell action has to be a plain command line invoking something that exists on disk. Write the logic to a real script file first (next to the code it belongs to), then point the action at that file.';

export class DialAuthorUtility {
    /** Set once `save_action` runs, so the loop knows it finished. */
    saved = false;

    constructor(
        private readonly actionId: string,
        private readonly slot: number,
    ) {}

    private fnFrom(a: Args): { fn?: ActionFn; error?: string } {
        const kind = a.text('kind');
        if (kind === 'shell') {
            const cmd = a.str('cmd');
            if (!cmd.trim()) return { error: 'shell needs a cmd' };
            if (INLINE_RUNTIME.test(cmd)) return { error: INLINE_COMPLAINT };
            return { fn: { kind: 'shell', cmd } };
        }
        if (kind === 'http') {
            const url = a.text('url');
            if (!url) return { error: 'http needs a url' };
            return {
                fn: {
                    kind: 'http',
                    url,
                    method: a.text('method', 'GET'),
                    headers: a.json<Record<string, string>>('headers', {}),
                    body: a.str('body') || undefined,
                },
            };
        }
        return { error: 'kind must be "http" or "shell"' };
    }

    @tool({
        name: 'test_action',
        description:
            'Run a draft action right now and see what comes back. Do this before saving, every time - for a light or a speaker this is also how you confirm it physically worked. Reference credentials as ${NAME}; they resolve at run time and you never see the value.',
    })
    @toolparam({
        key: 'kind',
        type: 'string',
        required: true,
        description: '"http" or "shell".',
    })
    @toolparam({
        key: 'cmd',
        type: 'string',
        required: false,
        description: 'shell: the command line. Must invoke a file on disk, not inline code.',
    })
    @toolparam({ key: 'url', type: 'string', required: false, description: 'http: the URL.' })
    @toolparam({
        key: 'method',
        type: 'string',
        required: false,
        description: 'http: default GET.',
    })
    @toolparam({
        key: 'headers',
        type: 'string',
        required: false,
        description: 'http: JSON object of headers.',
    })
    @toolparam({ key: 'body', type: 'string', required: false, description: 'http: request body.' })
    async test_action(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const a = new Args(call);
        const { fn, error } = this.fnFrom(a);
        if (error) return error;

        await Action.update(this.actionId, { status: 'testing' });
        const existing = await Action.get(this.actionId);
        if (!existing) return 'the action row went away';

        const result = await Actions.execute({ ...existing, fn: fn!, kind: fn!.kind });
        return [
            result.ok ? 'RAN OK' : 'FAILED',
            result.status !== undefined ? `status ${result.status}` : '',
            '\n',
            result.output || '(no output)',
            result.ok
                ? '\n\nIf that did the right thing, save it. If it returned a success code but did nothing useful, it is not done.'
                : '\n\nFix it and test again.',
        ]
            .filter(Boolean)
            .join(' ');
    }

    @tool({
        name: 'save_action',
        description:
            'Commit the working draft to the dial slot. Only call this after test_action actually did the right thing.',
    })
    @toolparam({
        key: 'label',
        type: 'string',
        required: true,
        description: 'Up to 14 characters, shown under the icon.',
    })
    @toolparam({
        key: 'icon',
        type: 'string',
        required: true,
        description:
            'One of: zap, terminal, play, refresh, moon, music, camera, chat, mic, globe, home, lock, wave, palette, settings, wrench, radio.',
    })
    @toolparam({ key: 'kind', type: 'string', required: true, description: '"http" or "shell".' })
    @toolparam({ key: 'cmd', type: 'string', required: false, description: 'shell: command line.' })
    @toolparam({ key: 'url', type: 'string', required: false, description: 'http: URL.' })
    @toolparam({ key: 'method', type: 'string', required: false, description: 'http: method.' })
    @toolparam({
        key: 'headers',
        type: 'string',
        required: false,
        description: 'http: JSON object of headers.',
    })
    @toolparam({ key: 'body', type: 'string', required: false, description: 'http: body.' })
    @toolparam({
        key: 'confirm',
        type: 'boolean',
        required: false,
        description: 'Require a second press. Set for anything destructive.',
    })
    async save_action(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const a = new Args(call);
        const { fn, error } = this.fnFrom(a);
        if (error) return error;

        await Action.update(this.actionId, {
            label: a.text('label', 'Action').slice(0, 14),
            icon: a.text('icon', 'zap'),
            kind: fn!.kind,
            fn: fn!,
            body: '',
            confirm: a.bool('confirm'),
            slot: this.slot,
            status: 'ready',
        });
        this.saved = true;
        return `Saved to slot ${this.slot}. It's on the dial now.`;
    }

    @tool({
        name: 'save_goal',
        description:
            "Save the configured goal for an agent button, once you've asked the user what it should do. The goal is what you'll run every time they press it, so write it as a complete instruction to yourself.",
    })
    @toolparam({
        key: 'label',
        type: 'string',
        required: true,
        description: 'Up to 14 characters, shown under the icon.',
    })
    @toolparam({
        key: 'goal',
        type: 'string',
        required: true,
        description:
            'The instruction, in second person, concrete enough to run unattended without asking anything further.',
    })
    async save_goal(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const a = new Args(call);
        const goal = a.str('goal').trim();
        if (!goal) return 'Need the goal.';

        await Action.update(this.actionId, {
            label: a.text('label', 'Brief').slice(0, 14),
            kind: 'agent',
            body: goal,
            fn: null,
            slot: this.slot,
            status: 'ready',
        });
        this.saved = true;
        return `Saved. Pressing slot ${this.slot} now runs that.`;
    }
}
