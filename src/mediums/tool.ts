import { tool, toolparam } from '@pompeii-labs/magma/decorators';
import type { MagmaToolCall } from '@pompeii-labs/magma/types';
import type { MagmaAgent } from '@pompeii-labs/magma';
import { notify, mediumStatuses } from './registry';
import type { Urgency } from './types';

/** Nero reaching the user when they're away from a screen. */
export class NotifyUtility {
    @tool({
        name: 'notify',
        description:
            "Reach the user off-screen with a push notification. Use only when something genuinely needs them while they're away (a long job you finished, a deadline approaching, a reply they asked you to watch for) — keep it rare and worth the buzz, never for chit-chat. If no channel is set up this will tell you; then ask the user to set one (they pick an ntfy topic, install the ntfy app and subscribe, then set the NTFY_TOPIC secret — you can stage it with request_secret).",
    })
    @toolparam({
        key: 'title',
        type: 'string',
        required: true,
        description: 'Short headline (a few words).',
    })
    @toolparam({
        key: 'body',
        type: 'string',
        required: true,
        description: 'The message — what happened and what (if anything) they should do.',
    })
    @toolparam({
        key: 'urgency',
        type: 'string',
        required: false,
        description: 'low | normal | high. high buzzes harder; use sparingly.',
    })
    async notify(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const title = String(call.fn_args.title ?? '').trim();
        const body = String(call.fn_args.body ?? '').trim();
        if (!title && !body) return 'Provide a title and body.';

        const statuses = await mediumStatuses();
        if (!statuses.some((s) => s.available)) {
            return 'No notification channel is set up. Ask the user to pick an ntfy topic, install the ntfy app and subscribe to it, then set the NTFY_TOPIC secret (you can stage it with request_secret).';
        }

        const urgency = ['low', 'normal', 'high'].includes(String(call.fn_args.urgency))
            ? (call.fn_args.urgency as Urgency)
            : 'normal';
        const res = await notify({ title: title || 'Nero', body: body || title, urgency });
        if (res.delivered.length) return `Sent via ${res.delivered.join(', ')}.`;
        return `Could not send: ${res.failed.map((f) => `${f.name} (${f.error})`).join('; ')}`;
    }
}
