import { tool, toolparam } from '@pompeii-labs/magma/decorators';
import type { MagmaToolCall } from '@pompeii-labs/magma/types';
import type { MagmaAgent } from '@pompeii-labs/magma';
import { Question, type AskItem, type AskOption } from '../models/question';
import { waitForAnswer } from './pending';

const ASK_TIMEOUT_MS = 5 * 60 * 1000;

/** Nero's structured-question tool. He poses one or a few decisions, each with
 *  concrete options; a focused, keyboard-driven card appears on the user's screen
 *  and this call BLOCKS until they answer, so he continues the same turn with their
 *  picks in context. A "Something else" free-text escape hatch is always offered. */
export class AskUtility {
    @tool({
        name: 'ask',
        description:
            'Ask the user to make a decision (or a few) and WAIT for their answer. Use this for genuine forks only they can settle (which approach, which option, confirm before something irreversible) instead of guessing or burying it in prose. Pass one or several questions; a focused card appears and this blocks until they pick, then returns their choices so you keep going in the same turn. The user can always type "something else", so keep your options to the likely paths. Do not ask what you can reasonably decide yourself.',
    })
    @toolparam({
        key: 'questions',
        type: 'string',
        required: true,
        description:
            'JSON array of 1-4 questions. Each: {"question":"...", "header":"<=12 char chip", "options":[{"label":"short choice","description":"the tradeoff"}], "multi":false}. 2-4 options per question; description optional; multi allows picking several.',
    })
    async ask(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        let items: AskItem[];
        try {
            const parsed = JSON.parse(String(call.fn_args.questions ?? '[]'));
            if (!Array.isArray(parsed)) return 'questions must be a JSON array.';
            items = parsed
                .map((q) => ({
                    question: String(q?.question ?? '').trim(),
                    header: q?.header ? String(q.header).slice(0, 16) : undefined,
                    multi: Boolean(q?.multi),
                    options: (Array.isArray(q?.options) ? q.options : [])
                        .map((o: { label?: unknown; description?: unknown }) => ({
                            label: String(o?.label ?? '').trim(),
                            description: o?.description ? String(o.description) : undefined,
                        }))
                        .filter((o: AskOption) => o.label),
                }))
                .filter((q) => q.question && q.options.length >= 2);
        } catch {
            return 'questions must be valid JSON.';
        }
        if (items.length === 0) {
            return 'Provide at least one question, each with 2+ labeled options.';
        }
        if (items.length > 4) items = items.slice(0, 4);

        const set = await Question.create({ items });
        const res = await waitForAnswer(set.id, ASK_TIMEOUT_MS);

        if (res.kind === 'timeout') {
            await Question.resolve(set.id, 'timeout', null);
            return 'The user did not answer in time. Use your best judgment or raise it again later.';
        }
        if (res.kind === 'cancelled') {
            return 'The user dismissed the question without choosing. Do not press them; proceed or move on.';
        }

        const lines = items.map((q, i) => {
            const picks = res.answers[i] ?? [];
            return `- ${q.question}\n  -> ${picks.length ? picks.join(', ') : '(no answer)'}`;
        });
        return `The user answered:\n${lines.join('\n')}`;
    }
}
