import { tool, toolparam } from '@pompeii-labs/magma/decorators';
import type { MagmaToolCall } from '@pompeii-labs/magma/types';
import type { MagmaAgent } from '@pompeii-labs/magma';
import { Mediums } from './registry';
import { Message } from '../../models/message';
import type { Urgency } from './types';
import { Args } from '../../util/args';

/** Nero reaching the user when they're away from a screen. */
export class NotifyUtility {
    @tool({
        name: 'notify',
        description:
            "Reach the user off-screen with a push notification (delivered to their Nero app). Use only when something genuinely needs them while they're away (a long job you finished, a deadline approaching, a reply they asked you to watch for) - keep it rare and worth the buzz, never for chit-chat. If it reports no device, the user hasn't opened the app / allowed notifications yet.",
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
        description: 'The message - what happened and what (if anything) they should do.',
    })
    @toolparam({
        key: 'urgency',
        type: 'string',
        required: false,
        description: 'low | normal | high. high buzzes harder; use sparingly.',
    })
    async notify(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const a = new Args(call);
        const title = a.text('title');
        const body = a.text('body');
        if (!title && !body) return 'Provide a title and body.';

        const statuses = await Mediums.statuses();
        if (!statuses.some((s) => s.available)) {
            return 'Push is not available (Lux not connected).';
        }

        const urgency = ['low', 'normal', 'high'].includes(a.str('urgency'))
            ? (call.fn_args.urgency as Urgency)
            : 'normal';
        const text = body || title;
        // Leave the message in the conversation so it's there when they open the app,
        // then push (gated by presence). Standalone message -> its own dispatch id.
        await Message.insertAgentText(text, crypto.randomUUID()).catch(() => {});
        const res = await Mediums.notify({ title: title || 'Nero', body: text, urgency });
        if (res.delivered.length) return `Sent to your app (via ${res.delivered.join(', ')}).`;
        return `Saved to the thread; push not delivered: ${res.failed.map((f) => `${f.name} (${f.error})`).join('; ') || 'no device registered'}.`;
    }
}
