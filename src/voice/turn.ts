import type { MagmaMessageType } from '@pompeii-labs/magma/types';
import { NeroAgent } from '../harness/agent';
import { buildSessionMessages } from '../harness/session';
import { foldThread } from '../harness/compaction';
import { recallForPrompt } from '../memory/memory';
import { buildUtilities } from '../tools';
import type { AgentActivity } from '../harness/activity';
import { Message } from '../models/message';
import { Dispatch } from '../models/dispatch';
import { Settings } from '../models/settings';

/** Recent-message window carried into a voice turn. Bounds prefill so
 *  time-to-first-token stays low; recency over completeness for spoken context. */
const VOICE_TAIL_MESSAGES = 40;

export interface VoiceTurnHooks {
    /** The agent has the turn and is generating. */
    onThinking?: () => void;
    /** A streamed chunk of the response text (feed to TTS). */
    onText?: (chunk: string) => void;
    /** Tool execution events during the turn. */
    onActivity?: (activity: AgentActivity) => void;
}

/**
 * Run ONE voice turn through the harness. This is deliberately the *same* path as
 * the chat dispatch, persist the user turn, recall memory, build the session
 * (compaction summary + un-compacted tail), run the agent, persist the answer,
 * fold compaction, so voice and chat are one mind with one history and Nero is
 * never "context-fucked" in voice mode. The only difference: it streams the
 * response text out via `onText` so TTS can start before the full answer lands.
 *
 * Returns the full response text.
 */
export async function runVoiceTurn(
    transcript: string,
    hooks: VoiceTurnHooks = {},
    signal?: AbortSignal,
    opts: { interaction?: boolean } = {},
): Promise<string> {
    const t0 = Date.now();
    const dispatch = await Dispatch.start();
    if (opts.interaction) await Message.insertInteraction(transcript, dispatch.id);
    else await Message.insertUser(transcript, { dispatch_id: dispatch.id });

    // Kick recall off immediately; it's an embedding round-trip we overlap with
    // agent setup + session assembly.
    const recall = recallForPrompt(transcript).catch(() => '');

    const model = (await Settings.getModel().catch(() => null)) ?? undefined;
    const agent = new NeroAgent({
        model,
        voice: true,
        utilities: buildUtilities({ includeMcp: false }),
    });
    // Barge-in: if the user talks over Nero, kill the in-flight generation.
    signal?.addEventListener('abort', () => agent.kill(), { once: true });
    await agent.setup();
    agent.beginRun(dispatch.id);
    if (hooks.onActivity) agent.onActivity = hooks.onActivity;
    if (hooks.onText) agent.onDelta = hooks.onText;

    // No loadImage: voice context is the text history only, and bounded to the
    // recent tail. Pulling stale screenshots back in as base64 vision blocks, or
    // dragging the full un-compacted backlog, balloons the prompt and tanks
    // time-to-first-token, that's the voice "context-fuck".
    const history = await buildSessionMessages({ tailLimit: VOICE_TAIL_MESSAGES });
    for (const m of history) agent.addMessage(m as MagmaMessageType);
    const tSession = Date.now() - t0;

    agent.currentMemories = await recall;
    const tRecall = Date.now() - t0;

    hooks.onThinking?.();
    const final = await agent.main();
    console.log(
        `[voice] turn prep session=${tSession}ms recall=${tRecall}ms main=${Date.now() - t0}ms`,
    );
    const content = final?.content ?? '';

    if (content) await Message.insertAgentText(content, dispatch.id);
    await Dispatch.update(dispatch.id, { status: signal?.aborted ? 'cancelled' : 'done' }).catch(
        () => {},
    );
    if (!signal?.aborted) await foldThread().catch(() => {});
    agent.endRun();

    return content;
}
