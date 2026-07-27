import { Action, type ActionData } from '../../models/action';
import { Memory } from '../../models/memory';
import { Settings } from '../../models/settings';
import { NeroAgent } from '../harness/agent';
import { buildAuthorUtilities, buildInterviewUtilities } from '../../tools';
import { DialAuthorUtility } from './author-tool';
import { TEMPLATES, getTemplate } from './catalog';
import { Logger } from '@nero/shared/logger';

const log = new Logger('dial-author');

/** One authoring run. Long enough to read a codebase and iterate on a device that
 *  doesn't answer first time; short enough not to run away. */
const TIMEOUT_MS = 5 * 60_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        p,
        new Promise<T>((_, rej) => setTimeout(() => rej(new Error('authoring timed out')), ms)),
    ]);
}

/**
 * Nero building a dial button, on the planning model.
 *
 * This is Nero himself, not a separate persona: same system prompt, same memory, his
 * own file and shell tools, plus two of his own — test and save. He is deliberately
 * skinny: no conversation history is loaded and `beginRun` is never called, so the
 * run persists nothing. The action row is the only state.
 *
 * The loop is the point. He drafts, **fires it for real**, reads what came back, and
 * fixes it. For a light or a speaker that is also the demo: you watch the thing
 * happen on the attempt that works.
 *
 * He never sees a secret value — he writes `${NAME}`, and it resolves server-side at
 * run time.
 */
function brief(slot: number, goal: string, existing?: ActionData): string {
    const current = existing
        ? `\nYou are REVISING a button that already exists, "${existing.label}". Keep it working; change what the user asked and nothing else. What it runs today:\n${JSON.stringify(existing.fn ?? existing.body, null, 2)}\n`
        : '';
    return `You're building a button for the Dial: the ring of eight slots around your orb. A press fires the action directly, with no model in the loop, so it has to stand on its own.

This one goes in slot ${slot}.
${current}
What the user wants:
${goal}

How to work:
- Look around first if the goal points at something that already exists — an MCP server you wrote, a script, a config. Read it and understand what it actually does before writing anything.
- Then draft, and call test_action to FIRE IT. Read what comes back. Fix and re-test until it genuinely does the right thing, not just until it exits zero.
- Call save_action once it works.

Hard rules:
- http when the target has an API. shell only when it doesn't.
- A shell action is a command line, never a program in a string. No node -e, no python -c, no heredocs. If the logic doesn't exist on disk yet, WRITE A SCRIPT FILE (next to the code it belongs to, with a sensible name), make sure it runs, and point the action at that file. That script is a real part of the user's toolset now, so write it properly.
- A press should feel instant. If a draft takes more than about a second, find out why and fix it: cache what you can, skip a discovery scan when the address is already known, avoid spawning a runtime you don't need. A button that takes five seconds is a bug, not a success.
- A shell action must exit on its own. If it opens a socket or a device connection, exit explicitly when the work is done, or it hangs until it's killed.
- Credentials are \${NAME} references, resolved at run time. Never inline a key, never invent a name.
- Don't fall back to a vaguer approach because the direct one is hard. If you truly cannot make it work, say so plainly and stop.

Templates that already exist, if one simply fits:
${TEMPLATES.map((t) => `  ${t.id} — ${t.description}`).join('\n')}`;
}

export class ActionAuthor {
    /**
     * Configure an `agent` button by asking the user what it should do.
     *
     * A generic "brief me" is worth little; yours is worth pressing daily. Nero asks
     * through the Ask card (which blocks until you answer), then writes the goal onto
     * the action. Pressing it afterwards runs that goal, not a canned prompt.
     */
    static async interview(actionId: string): Promise<ActionData | null> {
        const action = await Action.get(actionId);
        if (!action) return null;

        const template = action.template_id ? getTemplate(action.template_id) : undefined;
        const util = new DialAuthorUtility(action.id, action.slot);
        const connection = await Settings.resolveConnection('plan_model');
        const agent = new NeroAgent({ connection, utilities: buildInterviewUtilities(util) });
        await agent.setup();
        // no beginRun: the interview isn't conversation, it shouldn't be stored
        agent.currentMemories = await Memory.recallForPrompt(
            template?.description ?? action.label,
        ).catch(() => '');

        await Action.update(action.id, { status: 'drafting' });
        agent.addMessage({
            role: 'user',
            content: `You're setting up the "${action.label}" button on the user's Dial (slot ${action.slot}). It runs as a full agent turn each time they press it, so it needs a goal worth running.

${template?.interview ?? 'Ask the user what this button should do, then write it as an instruction to yourself.'}

Use the ask tool: give them real options drawn from what you actually know about them and what you can reach, not generic ones. You may ask more than once if the first answer leaves it ambiguous. Then call save_goal.

Write the goal in second person, concrete enough that you could run it unattended without asking anything further.`,
        });

        try {
            await withTimeout(agent.main(), TIMEOUT_MS);
        } catch (err) {
            log.warn('interview ended early', {
                cause: err instanceof Error ? err.message : String(err),
            });
        }

        const final = await Action.get(action.id);
        if (!util.saved) {
            // leave it usable rather than stuck mid-setup; pressing it retries
            await Action.update(action.id, { status: 'ready' });
        }
        return (await Action.get(action.id)) ?? final;
    }

    /**
     * Draft, test and bind an action for a slot. Returns the row in whatever state it
     * reached: `ready` when he saved a working one, `failed` otherwise. Progress lands
     * on the row as it goes, so the dial can render the slot mid-build.
     */
    static async author(goal: string, slot: number, reviseId?: string): Promise<ActionData> {
        // Revising keeps the same row, so the slot never blinks empty and the action
        // survives the attempt even if he can't improve it.
        const existing = reviseId ? await Action.get(reviseId) : null;
        const action =
            existing ??
            (await Action.create({
                label: 'Building…',
                kind: 'prompt',
                body: '',
                icon: 'refresh',
                slot,
                status: 'drafting',
                draft_log: `goal: ${goal}`,
            }));
        if (existing) await Action.update(existing.id, { status: 'drafting' });

        const util = new DialAuthorUtility(action.id, existing?.slot ?? slot);
        const connection = await Settings.resolveConnection('plan_model');
        const agent = new NeroAgent({ connection, utilities: buildAuthorUtilities(util) });
        await agent.setup();
        // deliberately no beginRun(): nothing about this run is persisted
        agent.currentMemories = await Memory.recallForPrompt(goal).catch(() => '');
        agent.addMessage({
            role: 'user',
            content: brief(existing?.slot ?? slot, goal, existing ?? undefined),
        });

        let closing = '';
        try {
            const res = await withTimeout(agent.main(), TIMEOUT_MS);
            closing = res?.content ?? '';
        } catch (err) {
            closing = err instanceof Error ? err.message : String(err);
            log.warn(`authoring slot ${slot} ended early`, { cause: closing });
        }

        const final = await Action.get(action.id);
        if (util.saved && final?.status === 'ready') {
            log.info(`authored "${final.label}" for slot ${slot}`);
            return (
                (await Action.update(action.id, {
                    draft_log: `goal: ${goal}\n${closing}`.slice(0, 4000),
                })) ?? final
            );
        }

        if (existing) {
            // it already worked before he touched it; leave it usable
            return (
                (await Action.update(action.id, {
                    status: 'ready',
                    draft_log: `revision failed: ${closing || 'no change saved'}`.slice(0, 4000),
                })) ?? action
            );
        }

        return (
            (await Action.update(action.id, {
                label: 'Failed',
                icon: 'lock',
                status: 'failed',
                draft_log: `goal: ${goal}\n${closing || 'he never saved a working action'}`.slice(
                    0,
                    4000,
                ),
            })) ??
            final ??
            action
        );
    }
}
