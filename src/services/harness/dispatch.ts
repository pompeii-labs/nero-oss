import type OpenAI from 'openai';
import type { MagmaMessageType } from '@pompeii-labs/magma/types';
import { NeroAgent } from './agent';
import { buildSessionMessages } from './session';
import { foldThread } from './compaction';
import { Memory } from '../../models/memory';
import { createEmitter, type Emitter } from '../realtime/emit';
import { fileBase64 } from '../files/store';
import { Dispatch } from '../../models/dispatch';
import { Message } from '../../models/message';
import { Settings } from '../../models/settings';
import { Logger } from '../../lib/logger';
import type { AttachmentRef } from '../../models/message';
import type { AgentActivity } from './activity';

const log = new Logger('dispatch');

/** Minimal surface the dispatcher drives; NeroAgent satisfies it structurally,
 *  and tests can inject a fake to avoid driving Magma's streaming internals. */
export interface RunnableAgent {
    setup(): Promise<void>;
    onDelta?: (text: string) => void;
    onActivity?: (a: AgentActivity) => void;
    currentMemories: string;
    /** Set by the dispatcher; the agent calls it at tool boundaries to fold in
     *  any steering messages sent mid-run. */
    steerCheck?: () => Promise<boolean>;
    beginRun(dispatchId: string): void;
    addMessage(message: MagmaMessageType): void;
    main(): Promise<{ content?: string } | null>;
    endRun(): void;
    kill(): void;
}

export interface DispatchInput {
    text: string;
    attachments?: AttachmentRef[];
    /** A panel interaction (button press), persisted as a labeled event, not as
     *  the user talking. */
    interaction?: boolean;
}

export interface DispatchOpts {
    client?: OpenAI;
    agentFactory?: () => RunnableAgent;
}

export interface DispatchHandle {
    dispatchId: string;
    steered: boolean;
    /** Resolves when the background run finishes (used by tests). */
    done: Promise<void>;
}

interface ActiveDispatch {
    id: string;
    agent: RunnableAgent;
    cancelled: boolean;
    emitter: Emitter;
    /** Messages the user sent mid-run, held here (not persisted) until folded in,
     *  so they land in the transcript AFTER the response they're steering. */
    pendingSteering: string[];
}

/** Single-flight dispatch coordinator. One run at a time; concurrent messages
 *  steer the active run instead of starting a new one. */
export class Dispatcher {
    private static active: ActiveDispatch | null = null;

    static isActive(): boolean {
        return Dispatcher.active !== null;
    }

    static activeDispatchId(): string | null {
        return Dispatcher.active?.id ?? null;
    }

    /** Cancel the in-flight dispatch (if any). Emits 'cancelled' immediately so the
     *  UI flips without waiting for the model call to unwind. Returns its id. */
    static async cancelActive(): Promise<string | null> {
        const active = Dispatcher.active;
        if (!active) return null;
        active.cancelled = true;
        await active.emitter.status('cancelled').catch(() => {});
        active.agent.kill();
        return active.id;
    }

    /**
     * If a run is active, the message is steering: persisted against the active
     * dispatch and folded in at the next tool boundary. Otherwise a new dispatch is
     * created and run fire-and-forget; output lands on the dispatch row + messages.
     */
    static async start(input: DispatchInput, opts: DispatchOpts = {}): Promise<DispatchHandle> {
        if (Dispatcher.active) {
            // Steering: queue it (don't persist yet) so it folds in after the
            // current response and sorts correctly in the transcript.
            Dispatcher.active.pendingSteering.push(input.text);
            return { dispatchId: Dispatcher.active.id, steered: true, done: Promise.resolve() };
        }

        const dispatch = await Dispatch.start();
        if (input.interaction) {
            await Message.insertInteraction(input.text, dispatch.id);
        } else {
            await Message.insertUser(input.text, {
                dispatch_id: dispatch.id,
                attachments: input.attachments ?? null,
            });
        }

        // Resolve the model fresh each run: a Lux `/model` override wins, else the
        // env default. Takes effect on the very next message, no restart.
        const model = (await Settings.getModel().catch(() => null)) ?? undefined;
        const agent: RunnableAgent = opts.agentFactory
            ? opts.agentFactory()
            : new NeroAgent({ client: opts.client, model });
        const emitter = createEmitter(dispatch.id);
        const entry: ActiveDispatch = {
            id: dispatch.id,
            agent,
            cancelled: false,
            emitter,
            pendingSteering: [],
        };
        Dispatcher.active = entry;

        const done = Dispatcher.runToCompletion(entry, input.text, agent, emitter).finally(() => {
            if (Dispatcher.active?.id === dispatch.id) Dispatcher.active = null;
        });

        return { dispatchId: dispatch.id, steered: false, done };
    }

    /** Fold any queued steering messages into the run: persist them now (so they
     *  sort after the response they steer) and add them to the agent's history. */
    private static async drainSteering(
        entry: ActiveDispatch,
        agent: RunnableAgent,
    ): Promise<boolean> {
        if (entry.pendingSteering.length === 0) return false;
        const texts = entry.pendingSteering.splice(0);
        for (const text of texts) {
            await Message.insertUser(text, { dispatch_id: entry.id });
            agent.addMessage({
                role: 'user',
                content: `[Sent while you were working]\n${text}`,
            });
        }
        return true;
    }

    private static async runToCompletion(
        entry: ActiveDispatch,
        triggerText: string,
        agent: RunnableAgent,
        emitter: Emitter,
    ): Promise<void> {
        const dispatchId = entry.id;
        try {
            await agent.setup();
            // Streaming intentionally disabled: the UI shows a loader while working
            // and the full completion lands when ready (no token-by-token).
            agent.onActivity = (a) => emitter.activity(a);
            agent.beginRun(dispatchId);
            agent.steerCheck = () => Dispatcher.drainSteering(entry, agent);
            agent.currentMemories = await Memory.recallForPrompt(triggerText).catch(() => '');

            const history = await buildSessionMessages({ loadImage: (ref) => fileBase64(ref.id) });
            for (const m of history) agent.addMessage(m as MagmaMessageType);

            await emitter.status('running');
            let final = await agent.main();

            // Steering loop: persist the answer, then if the user sent anything while
            // we were working (including for a pure-text response with no tool calls),
            // fold it in and run again to address it. Bounded for safety.
            for (let i = 0; i < 5; i++) {
                if (entry.cancelled) break;
                const content = final?.content ?? '';
                if (content) await Message.insertAgentText(content, dispatchId);
                emitter.setFullText(content);

                const folded = await Dispatcher.drainSteering(entry, agent);
                if (!folded) break;
                await emitter.status('running');
                final = await agent.main();
            }

            if (entry.cancelled) {
                await emitter.status('cancelled');
            } else {
                await emitter.status('compacting');
                await foldThread().catch((e) =>
                    log.error('compaction failed', { error: String(e) }),
                );
                await emitter.status('done');
            }
        } catch (err) {
            if (entry.cancelled) {
                await emitter.status('cancelled').catch(() => {});
            } else {
                log.error('dispatch failed', { error: String(err) });
                await emitter.status('error').catch(() => {});
            }
        } finally {
            agent.endRun();
            await emitter.stop();
        }
    }
}
