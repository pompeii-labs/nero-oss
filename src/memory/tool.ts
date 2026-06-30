import { tool, toolparam } from '@pompeii-labs/magma/decorators';
import type { MagmaToolCall } from '@pompeii-labs/magma/types';
import type { MagmaAgent } from '@pompeii-labs/magma';
import { Memory } from '../models/memory';

/** Durable memory tools exposed to Nero: explicitly save a fact, or search for
 *  relevant ones. Recall also happens automatically each turn (JIT), so this is
 *  for deliberate saves and on-demand lookups. */
export class MemoryUtility {
    @tool({
        name: 'remember',
        description:
            'Save a durable fact worth remembering across conversations (a preference, a decision, a detail about the user or their world). Use sparingly for things that should persist.',
    })
    @toolparam({
        key: 'content',
        type: 'string',
        required: true,
        description: 'The fact to remember, as a concise standalone statement.',
    })
    async remember(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const content = String(call.fn_args.content ?? '');
        const res = await Memory.remember(content);
        if (res.status === 'added') return 'Saved.';
        if (res.status === 'duplicate') return 'Already knew that.';
        return `Not saved (${res.reason}).`;
    }

    @tool({
        name: 'search_memory',
        description: 'Search your durable memory for facts relevant to a query.',
    })
    @toolparam({ key: 'query', type: 'string', required: true, description: 'What to look for.' })
    async search_memory(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const rows = await Memory.recall(String(call.fn_args.query ?? ''), 5);
        return rows.length ? Memory.format(rows) : 'No relevant memories.';
    }
}
