import { MagmaAgent } from '@pompeii-labs/magma';
import { middleware } from '@pompeii-labs/magma/decorators';
import { MagmaMessage } from '@pompeii-labs/magma/types';
import type {
    MagmaContentBlock,
    MagmaToolCall,
    MagmaToolResult,
    MagmaStreamChunk,
    MagmaUtilities,
} from '@pompeii-labs/magma/types';
import OpenAI from 'openai';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { loadConfig } from '../config';
import { getContextWindow } from './context';
import { countTokens } from './tokens';
import { truncateToolResult } from './truncate';
import type { AgentActivity } from './activity';
import { buildUtilities } from '../tools';
import * as messagesData from '../data/messages';

/** Keep recent tool output verbatim up to this fraction of the window; clear
 *  older results (block + id preserved so call/result pairing holds). */
const KEEP_TOOL_OUTPUT_RATIO = 0.5;

export interface NeroAgentOpts {
    client?: OpenAI;
    model?: string;
    utilities?: MagmaUtilities[];
    /** Voice turn: append speech-formatting guidance to the system prompt. */
    voice?: boolean;
}

/** Appended to the system prompt on voice turns. The response is read aloud by
 *  TTS, so it must be spoken language, not displayed text. */
const VOICE_STYLE = `## You are speaking out loud
Your reply is read aloud by text-to-speech right now, not shown as text. Write exactly what should be HEARD, as natural spoken language.
- No markdown: no bullet or numbered lists, no tables, no headings, no bold/italic, no code blocks, no links. Just flowing sentences, the way you'd actually talk.
- Be short and conversational. Don't narrate a structured document; say the gist like you're talking to someone.
- Numbers: speak them naturally. A quantity like 4,857 is "four thousand eight hundred fifty seven"; a bare digit sequence or code like 4857 is "four eight five seven"; phone numbers digit by digit.
- Emails and URLs: spell them out, e.g. "matty at pompeii labs dot com", "example dot com slash docs".
- Symbols and units: say them, e.g. "$5" is "five dollars", "50%" is "fifty percent", "&" is "and".
- Expand abbreviations to how you'd pronounce them.`;

export class NeroAgent extends MagmaAgent {
    /** Resolved at setup() so the synchronous getMessages() can size the
     *  tool-output keep budget without an async call. Public so tests can shrink it. */
    contextWindow = 128_000;

    /** Live token deltas (set by the dispatch layer -> realtime). */
    onDelta?: (text: string) => void;
    /** Tool-execution events (set by the dispatch layer -> realtime). */
    onActivity?: (activity: AgentActivity) => void;
    /** Token usage on the final chunk (project workers meter spend with this). */
    onUsage?: (u: { input: number; output: number; cached: number }) => void;
    /** Memory recall block injected into the system prompt for the current run. */
    currentMemories = '';
    /** Set by the dispatcher; called at tool boundaries to fold in steering. */
    steerCheck?: () => Promise<boolean>;

    private currentDispatchId?: string;
    private _utilities: MagmaUtilities[];
    /** The model this run actually uses (Lux override or env default). */
    private resolvedModel: string;
    private voice: boolean;

    constructor(opts: NeroAgentOpts = {}) {
        const cfg = loadConfig();
        const client =
            opts.client ??
            new OpenAI({
                baseURL: cfg.openrouter.baseUrl,
                apiKey: cfg.openrouter.apiKey,
                timeout: 120_000,
                maxRetries: 2,
                defaultHeaders: { 'X-Title': 'Nero' },
            });

        const model = opts.model ?? cfg.model;
        super({
            provider: 'openai',
            model,
            client,
            settings: { temperature: 0.7 },
            messageContext: -1,
            stream: true,
        });

        this.resolvedModel = model;
        this._utilities = opts.utilities ?? buildUtilities();
        this.voice = opts.voice ?? false;
    }

    async setup(): Promise<void> {
        this.contextWindow = await getContextWindow(this.resolvedModel);
    }

    getUtilities(): MagmaUtilities[] {
        return this._utilities;
    }

    /** Begin a run: bind the dispatch + the steering watermark (the trigger
     *  message id; anything a human writes after it is steering for this run). */
    beginRun(dispatchId: string): void {
        this.currentDispatchId = dispatchId;
    }

    endRun(): void {
        this.currentDispatchId = undefined;
        this.onDelta = undefined;
        this.onActivity = undefined;
        this.steerCheck = undefined;
    }

    onStreamChunk(chunk: MagmaStreamChunk | null): void {
        const text = chunk?.delta?.content;
        if (text && this.onDelta) this.onDelta(text);
        // Final chunk carries usage; surface prompt-cache effectiveness. Magma maps
        // OpenRouter's cached_tokens onto cache_write_tokens, and input_tokens is the
        // fresh (uncached) prompt remainder.
        const u = chunk?.usage;
        if (u && u.input_tokens != null) {
            const cached = u.cache_write_tokens ?? 0;
            console.log(
                `[cache] fresh=${u.input_tokens} cached=${cached} out=${u.output_tokens ?? 0}`,
            );
            this.onUsage?.({ input: u.input_tokens, output: u.output_tokens ?? 0, cached });
        }
    }

    /**
     * Per-call tool-output pruning. Magma builds each request from getMessages();
     * keep recent tool results verbatim, clear older ones (block + id preserved).
     * Returns cleared copies, never mutating stored history.
     */
    getMessages(slice?: number): MagmaMessage[] {
        const messages = super.getMessages(slice);

        const keepBudget = this.contextWindow * KEEP_TOOL_OUTPUT_RATIO;
        const clearAt = new Set<number>();
        let kept = 0;
        for (let i = messages.length - 1; i >= 0; i--) {
            for (const block of messages[i].blocks ?? []) {
                if (block.type !== 'tool_result') continue;
                if (kept > keepBudget) {
                    clearAt.add(i);
                } else {
                    const r = block.tool_result.result;
                    kept += countTokens(typeof r === 'string' ? r : JSON.stringify(r ?? ''));
                }
            }
        }
        if (clearAt.size === 0) return messages;

        return messages.map((m, i) => {
            if (!clearAt.has(i)) return m;
            const blocks: MagmaContentBlock[] = (m.blocks ?? []).map((b) =>
                b.type === 'tool_result'
                    ? {
                          ...b,
                          tool_result: { ...b.tool_result, result: '[old tool result cleared]' },
                      }
                    : b,
            );
            return new MagmaMessage({ role: m.role, blocks });
        });
    }

    private loadPromptTemplate(): string {
        const paths = [
            resolve(import.meta.dir, '..', '..', 'prompts', 'system.txt'),
            resolve(import.meta.dir, '..', 'prompts', 'system.txt'),
        ];
        for (const p of paths) {
            try {
                return readFileSync(p, 'utf-8');
            } catch {
                /* try next */
            }
        }
        throw new Error('Could not find prompts/system.txt');
    }

    getSystemPrompts() {
        const cfg = loadConfig();
        const now = new Date();
        const human = now.toLocaleString('en-US', {
            timeZone: cfg.timezone,
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
        });
        const context =
            `Right now it is ${human} (${cfg.timezone}). ` +
            `The current year is ${now.getFullYear()} — use today's real date for anything ` +
            `time-sensitive (web searches, "latest"/"recent" queries, scheduling). Do not assume ` +
            `an earlier year from your training. ISO: ${now.toISOString()}.`;

        // Prompt caching: split the template at its volatile tail. The stable
        // instructions get a cache breakpoint, and because Anthropic's cache prefix
        // is tools -> system -> messages, that one breakpoint also caches the tool
        // schemas (the bulk of the per-turn prompt) sitting before it. Memories +
        // time go in a separate, uncached block so the cached key is identical turn
        // to turn. Only Anthropic models on OpenRouter honor cache_control.
        // ONE system message with two text blocks: a single message whose first
        // block carries the cache breakpoint is what OpenRouter actually caches
        // (two separate system messages are NOT cached). The volatile second block
        // (memories + time) sits after the breakpoint, processed fresh each turn.
        const [base] = this.loadPromptTemplate().split('{{MEMORIES}}');
        // Voice guidance is stable across voice turns, so it stays in the cached
        // block (voice and chat just get separate cache entries).
        const stable = this.voice ? `${base.trim()}\n\n${VOICE_STYLE}` : base.trim();
        const volatile = `${this.currentMemories || ''}\n\n${context}`.trim();
        const cache = this.resolvedModel.startsWith('anthropic/');
        return [
            {
                role: 'system' as const,
                blocks: [
                    { type: 'text' as const, text: stable, cache },
                    { type: 'text' as const, text: volatile },
                ],
            },
        ];
    }

    private formatToolName(name: string): string {
        return name
            .replace(/_/g, ' ')
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .replace(/\b\w/g, (c) => c.toUpperCase())
            .trim();
    }

    @middleware('preToolExecution')
    async onToolStart(call?: MagmaToolCall): Promise<void> {
        if (!call) return;
        this.onActivity?.({
            id: call.id,
            status: 'running',
            details: {
                display_name: this.formatToolName(call.fn_name),
                fn_name: call.fn_name,
                args: call.fn_args,
                result: null,
            },
        });
    }

    @middleware('onToolExecution')
    async onToolEnd(result?: MagmaToolResult): Promise<MagmaToolResult | void> {
        if (!result) return;

        result.result = truncateToolResult(result.result);

        this.onActivity?.({
            id: result.id,
            status: result.error ? 'error' : 'success',
            details: {
                display_name: this.formatToolName(result.fn_name),
                fn_name: result.fn_name,
                args: result.call.fn_args,
                result: result.result ?? null,
            },
        });

        if (this.currentDispatchId) {
            await messagesData
                .insertToolCall(
                    {
                        tool_id: result.id,
                        fn_name: result.fn_name,
                        args: result.call.fn_args,
                        result: result.result,
                        status: result.error ? 'error' : 'success',
                    },
                    this.currentDispatchId,
                )
                .catch((e) => console.error('[nero] persist tool row failed:', e));
        }

        // Fold in any steering messages queued during this tool run.
        await this.steerCheck?.();
        return result;
    }
}
