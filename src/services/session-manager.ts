import OpenAI from 'openai';
import chalk from 'chalk';
import { isDbConnected } from '../db/index.js';
import { Summary } from '../models/summary.js';
import { Memory } from '../models/memory.js';
import { SessionService, UnsummarizedSession } from './session.js';
import { SessionSettings } from '../config.js';

interface ExtractedMemory {
    content: string;
    core: boolean;
}

export class SessionManager {
    private sessionService: SessionService;
    private openaiClient: OpenAI;
    private model: string;
    private settings: SessionSettings;
    private isProcessing = false;
    private verbose: boolean;

    constructor(params: {
        openaiClient: OpenAI;
        model: string;
        settings: SessionSettings;
        verbose?: boolean;
    }) {
        this.openaiClient = params.openaiClient;
        this.model = params.model;
        this.settings = params.settings;
        this.verbose = params.verbose ?? false;
        this.sessionService = new SessionService(params.settings.gapThresholdMinutes);
    }

    getSessionService(): SessionService {
        return this.sessionService;
    }

    async onUserMessage(): Promise<void> {
        if (!this.settings.enabled || !this.settings.autoSummarize) return;
        if (this.isProcessing) return;
        if (!isDbConnected()) return;

        const sessionInfo = await this.sessionService.detectSession();
        if (!sessionInfo.isNewSession) return;

        this.processUnsummarizedSessions().catch((err) => {
            console.error(chalk.dim(`[sessions] Background processing error: ${err.message}`));
        });
    }

    async processUnsummarizedSessions(): Promise<void> {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            const unsummarized = await this.sessionService.getUnsummarizedPreviousSession();
            if (!unsummarized) {
                return;
            }

            if (unsummarized.messages.length < 4) {
                if (this.verbose) {
                    console.log(
                        chalk.dim(
                            `[sessions] Skipping short session (${unsummarized.messages.length} messages)`,
                        ),
                    );
                }
                return;
            }

            console.log(
                chalk.dim(
                    `[sessions] Summarizing previous session (${unsummarized.messages.length} messages)...`,
                ),
            );

            const summary = await this.generateSessionSummary(unsummarized);

            await Summary.createSessionSummary({
                content: summary,
                sessionStart: unsummarized.start,
                sessionEnd: unsummarized.end,
                messageCount: unsummarized.messages.length,
            });

            if (this.settings.autoExtractMemories) {
                const memories = await this.extractMemories(unsummarized);
                for (const mem of memories) {
                    await Memory.create({
                        body: mem.content,
                        category: mem.core ? 'core' : null,
                        related_to: [],
                    });
                }
                if (memories.length > 0 && this.verbose) {
                    console.log(chalk.dim(`[sessions] Extracted ${memories.length} memories`));
                }
            }

            console.log(chalk.dim(`[sessions] Session summary saved`));
        } finally {
            this.isProcessing = false;
        }
    }

    private formatSessionMessages(session: UnsummarizedSession): string {
        const mediums = [...new Set(session.messages.map((m) => m.medium))];
        const mediumNote =
            mediums.length > 1
                ? `[Session via: ${mediums.join(', ')}]\n\n`
                : `[Session via ${mediums[0] || 'terminal'}]\n\n`;

        const conversationText = session.messages
            .map((m) => {
                const role = m.role === 'user' ? 'User' : 'Assistant';
                return `${role} [${m.medium}]: ${m.content}`;
            })
            .join('\n\n');

        return mediumNote + conversationText;
    }

    private async generateSessionSummary(session: UnsummarizedSession): Promise<string> {
        const conversationText = this.formatSessionMessages(session);

        const response = await this.openaiClient.chat.completions.create({
            model: this.model,
            messages: [
                {
                    role: 'system',
                    content: `Summarize this conversation session. Focus on:
- Main topics discussed and problems solved
- Key decisions or conclusions reached
- Important technical details or context established
- Any action items or follow-ups mentioned

The medium (voice, terminal, sms, slack) provides context about the conversation style.
Be thorough - this summary will be used as context for future conversations.
Write a detailed summary in 1-3 paragraphs.

IMPORTANT: Output plain text only. No markdown, no headers, no bold, no bullet points.`,
                },
                {
                    role: 'user',
                    content: conversationText,
                },
            ],
            temperature: 0.5,
            max_tokens: 1000,
        });

        return response.choices[0]?.message?.content || 'Session summary unavailable';
    }

    private async extractMemories(session: UnsummarizedSession): Promise<ExtractedMemory[]> {
        const conversationText = this.formatSessionMessages(session);

        const response = await this.openaiClient.chat.completions.create({
            model: this.model,
            messages: [
                {
                    role: 'system',
                    content: `Extract LASTING facts from this conversation that would be useful to remember for future sessions.

Return a JSON array of objects with "content" (string) and "core" (boolean) fields.

Set "core": true ONLY for essential, permanent facts about the user that should always be in context:
- Who they are, their role, their situation
- Strong preferences or opinions
- Important personal/work context

Set "core": false for useful but situational facts:
- Current projects or tech stack (these change)
- Contextual information

ONLY extract facts that will remain true and useful beyond this session.

DO NOT extract:
- One-time fixes or session-specific solutions
- What happened during this conversation
- Observations about this particular interaction

Return an empty array [] if nothing worth remembering long-term.

Example:
[
  {"content": "User is a backend engineer", "core": true},
  {"content": "User runs a Node.js API with image processing", "core": false}
]`,
                },
                {
                    role: 'user',
                    content: conversationText,
                },
            ],
            temperature: 0.3,
            max_tokens: 1000,
        });

        const content = response.choices[0]?.message?.content || '[]';

        try {
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (!jsonMatch) return [];

            const parsed = JSON.parse(jsonMatch[0]) as ExtractedMemory[];
            return parsed.filter(
                (m) => m.content && typeof m.content === 'string' && typeof m.core === 'boolean',
            );
        } catch {
            return [];
        }
    }
}
