import { MagmaAgent } from '@pompeii-labs/magma';
import { tool, toolparam } from '@pompeii-labs/magma/decorators';
import type {
    MagmaMessage,
    MagmaToolCall,
    MagmaSystemMessageType,
} from '@pompeii-labs/magma/types';
import OpenAI from 'openai';
import chalk from 'chalk';
import { readFile, writeFile, readdir, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { encode as toon } from '@toon-format/toon';
import { NeroConfig, getConfigDir } from '../config.js';
import { discoverSkills, loadSkill, getSkillContent, type Skill } from '../skills/index.js';
import { McpClient } from '../mcp/client.js';
import { db, isDbConnected } from '../db/index.js';
import { Message, Memory, Action, Summary, Note } from '../models/index.js';
import { generateDiff } from '../util/diff.js';
import { hostToContainer, containerToHost } from '../util/paths.js';
import { formatSessionAge } from '../util/temporal.js';
import { Logger, formatToolName } from '../util/logger.js';
import { ProactivityManager } from '../proactivity/index.js';
import { isDestructiveToolCall } from '../proactivity/destructive.js';
import { SessionManager } from '../services/session-manager.js';
import { processManager } from '../services/process-manager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ChatResponse {
    content: string;
    streamed: boolean;
}

export interface ToolActivity {
    id: string;
    tool: string;
    displayName?: string;
    args: Record<string, any>;
    status: 'pending' | 'approved' | 'denied' | 'skipped' | 'running' | 'complete' | 'error';
    result?: string;
    error?: string;
    skipReason?: string;
}

export type PermissionCallback = (activity: ToolActivity) => Promise<boolean>;
export type ActivityCallback = (activity: ToolActivity) => void;

export interface LoadedMessage {
    role: 'user' | 'assistant';
    content: string;
    created_at: string;
    medium?: 'terminal' | 'voice' | 'sms' | 'web' | 'cli' | 'api' | 'slack';
    isHistory?: boolean;
}

export class Nero extends MagmaAgent {
    config: NeroConfig;
    private mcpClient: McpClient;
    private openaiClient: OpenAI;
    private systemPrompt: string = '';
    private userInstructions: string = '';
    private onChunk?: (chunk: string) => void;
    private onPermissionRequest?: PermissionCallback;
    private onActivity?: ActivityCallback;
    private memoriesCache: Array<{ body: string; created_at: string }> = [];
    private actionsCache: Array<{ request: string; timestamp: string }> = [];
    private loadedMessages: LoadedMessage[] = [];
    private hasSummary: boolean = false;
    private proactivity: ProactivityManager;
    private pendingThoughts: Array<{ id: number; thought: string; created_at: Date }> = [];
    private pendingNotes: Array<{
        id: number;
        content: string;
        category: string | null;
        created_at: Date;
    }> = [];
    private backgroundMode: boolean = false;
    private sessionManager: SessionManager | null = null;
    private _isProcessing: boolean = false;
    private _aborted: boolean = false;

    constructor(config: NeroConfig) {
        const client = new OpenAI({
            baseURL: 'https://openrouter.ai/api/v1',
            apiKey: process.env.OPENROUTER_API_KEY!,
        });

        super({
            provider: 'openai',
            model: 'anthropic/claude-opus-4.5',
            client,
            settings: {
                temperature: 0.7,
            },
            messageContext: -1,
        });

        this.config = config;
        this.openaiClient = client;
        this.mcpClient = new McpClient(config.mcpServers);
        this.proactivity = new ProactivityManager(config);
        this.proactivity.setAgent(this);
        this.initSessionManager();
    }

    private initSessionManager(): void {
        if (this.config.settings.sessions?.enabled) {
            this.sessionManager = new SessionManager({
                openaiClient: this.openaiClient,
                model: this.config.settings.model,
                settings: this.config.settings.sessions,
                verbose: this.config.settings.verbose,
            });
        }
    }

    private skillsCache: Skill[] = [];
    private loadedSkills: Map<string, { skill: Skill; args: string[] }> = new Map();

    async setup(): Promise<void> {
        const promptPath = join(__dirname, '../../prompts/main.txt');
        try {
            this.systemPrompt = await readFile(promptPath, 'utf-8');
        } catch {
            const altPath = join(process.cwd(), 'prompts/main.txt');
            this.systemPrompt = await readFile(altPath, 'utf-8');
        }

        await this.loadUserInstructions();
        await this.mcpClient.connect();
        await this.loadSkills();

        const mcpTools = await this.mcpClient.getTools();
        console.log(chalk.dim(`[setup] Loaded ${mcpTools.length} MCP tools`));

        if (this.sessionManager && this.config.settings.sessions.enabled) {
            await this.loadSessionAwareHistory();
        } else {
            await this.loadRecentMessages(this.config.settings.historyLimit);
        }
        await this.refreshMemoriesCache();
        await this.refreshActionsCache();
        if (this.memoriesCache.length > 0) {
            console.log(chalk.dim(`[setup] Loaded ${this.memoriesCache.length} memories`));
        }
    }

    private async loadSkills(): Promise<void> {
        try {
            this.skillsCache = await discoverSkills();
            if (this.skillsCache.length > 0) {
                console.log(chalk.dim(`[setup] Loaded ${this.skillsCache.length} skills`));
            }
        } catch {
            this.skillsCache = [];
        }
    }

    async refreshSkills(): Promise<void> {
        await this.loadSkills();
    }

    getLoadedSkillNames(): string[] {
        return Array.from(this.loadedSkills.keys());
    }

    loadSkillIntoContext(skill: Skill, args: string[]): void {
        this.loadedSkills.set(skill.name, { skill, args });
    }

    unloadSkillFromContext(name: string): boolean {
        return this.loadedSkills.delete(name);
    }

    private getSkillsContext(): string {
        let context = '';

        if (this.loadedSkills.size > 0) {
            context += '\n\n## Active Skills\n\n';
            context +=
                'The following skills are currently loaded. Follow their instructions for the relevant tasks. ';
            context += 'Use the `unloadSkill` tool when you are done with a skill.\n';

            for (const [name, { skill, args }] of this.loadedSkills) {
                const content = getSkillContent(skill, args);
                context += `\n<skill name="${name}">\n${content}\n</skill>\n`;
            }
        }

        if (this.skillsCache.length === 0) return context;

        const unloaded = this.skillsCache.filter((s) => !this.loadedSkills.has(s.name));

        if (unloaded.length > 0) {
            context += '\n\n## Available Skills\n\n';
            context +=
                'You have access to specialized skills that provide detailed instructions for specific tasks. ';
            context +=
                'Use the `skill` tool to load a skill when the task matches its description.\n\n';

            for (const skill of unloaded) {
                context += `- **${skill.name}**: ${skill.metadata.description || 'No description'}\n`;
            }
        }

        return context;
    }

    private async loadRecentMessages(limit = 50): Promise<void> {
        if (!isDbConnected()) return;

        try {
            const summary = await Summary.getLatest();

            if (summary) {
                this.hasSummary = true;
                this.addMessage({
                    role: 'system',
                    content: `[Previous conversation summary]: ${summary.content}`,
                });

                const messages = await Message.getSince(summary.covers_until, limit);
                const reversed = messages.reverse();

                this.loadedMessages = reversed
                    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
                    .map((msg) => ({
                        role: msg.role as 'user' | 'assistant',
                        content: msg.content,
                        created_at: String(msg.created_at),
                        medium: msg.medium,
                        isHistory: true,
                    }));

                for (const msg of reversed) {
                    if (msg.role === 'user' || msg.role === 'assistant') {
                        this.addMessage({ role: msg.role, content: msg.content });
                    }
                }

                console.log(chalk.dim(`[setup] Loaded summary + ${reversed.length} messages`));
            } else {
                const messages = await Message.getRecent(limit);
                const reversed = messages.reverse();

                this.loadedMessages = reversed
                    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
                    .map((msg) => ({
                        role: msg.role as 'user' | 'assistant',
                        content: msg.content,
                        created_at: String(msg.created_at),
                        medium: msg.medium,
                        isHistory: true,
                    }));

                for (const msg of reversed) {
                    if (msg.role === 'user' || msg.role === 'assistant') {
                        this.addMessage({ role: msg.role, content: msg.content });
                    }
                }

                if (reversed.length > 0) {
                    console.log(chalk.dim(`[setup] Loaded ${reversed.length} previous messages`));
                }
            }
        } catch (error) {
            console.error(chalk.dim(`[db] Failed to load messages: ${(error as Error).message}`));
        }
    }

    private async loadSessionAwareHistory(): Promise<void> {
        if (!isDbConnected() || !this.sessionManager) return;

        try {
            const sessionService = this.sessionManager.getSessionService();
            const sessionInfo = await sessionService.detectSession();

            const sessionSummaries = await Summary.getRecentSessionSummaries(
                this.config.settings.sessions.maxSessionSummaries,
            );

            const latestManualSummary = await Summary.getLatestNonSession();
            if (latestManualSummary) {
                const newerThanAllSessions =
                    sessionSummaries.length === 0 ||
                    latestManualSummary.created_at > sessionSummaries[0].created_at;

                if (newerThanAllSessions) {
                    const age = formatSessionAge(latestManualSummary.created_at);
                    this.addMessage({
                        role: 'system',
                        content: `[Conversation summary, ${age}]: ${latestManualSummary.content}`,
                    });
                    this.hasSummary = true;
                    console.log(chalk.dim(`[setup] Loaded manual summary`));
                }
            }

            for (const summary of sessionSummaries.reverse()) {
                const age = formatSessionAge(summary.created_at);
                const msgCount = summary.message_count
                    ? ` (${summary.message_count} messages)`
                    : '';
                this.addMessage({
                    role: 'system',
                    content: `[Previous session${msgCount}, ${age}]: ${summary.content}`,
                });
                this.hasSummary = true;
            }

            if (sessionSummaries.length > 0) {
                console.log(
                    chalk.dim(`[setup] Loaded ${sessionSummaries.length} session summaries`),
                );
            }

            let messages: Message[] = [];
            if (sessionInfo.currentSessionStart) {
                messages = await sessionService.getMessagesSinceSessionStart(
                    sessionInfo.currentSessionStart,
                    this.config.settings.historyLimit,
                );
            }

            if (messages.length === 0 && sessionSummaries.length === 0 && !latestManualSummary) {
                const fallback = await Message.getRecent(this.config.settings.historyLimit);
                messages = fallback.reverse();
            }

            this.loadedMessages = messages
                .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
                .map((msg) => ({
                    role: msg.role as 'user' | 'assistant',
                    content: msg.content,
                    created_at: String(msg.created_at),
                    medium: msg.medium,
                    isHistory: true,
                }));

            for (const msg of messages) {
                if (msg.role === 'user' || msg.role === 'assistant') {
                    this.addMessage({ role: msg.role, content: msg.content });
                }
            }

            if (messages.length > 0) {
                console.log(
                    chalk.dim(`[setup] Loaded ${messages.length} current session messages`),
                );
            }
        } catch (error) {
            console.error(
                chalk.dim(`[sessions] Failed to load history: ${(error as Error).message}`),
            );
            await this.loadRecentMessages(this.config.settings.historyLimit);
        }
    }

    getLoadedMessages(): LoadedMessage[] {
        return this.loadedMessages;
    }

    hasPreviousSummary(): boolean {
        return this.hasSummary;
    }

    private estimateStringTokens(str: string): number {
        return Math.ceil(str.length / 3.5);
    }

    estimateTokens(): number {
        let total = 0;

        const systemPrompts = this.getSystemPrompts();
        for (const prompt of systemPrompts) {
            if (typeof prompt.content === 'string') {
                total += this.estimateStringTokens(prompt.content);
            }
        }

        const builtInTools = this.getTools();
        for (const tool of builtInTools) {
            total += this.estimateStringTokens(tool.name);
            total += this.estimateStringTokens(tool.description);
            if (tool.params) {
                total += this.estimateStringTokens(JSON.stringify(tool.params));
            }
        }

        const mcpTools = this.mcpClient.getToolsSync();
        for (const tool of mcpTools) {
            total += this.estimateStringTokens(tool.name);
            total += this.estimateStringTokens(tool.description || '');
            if (tool.inputSchema) {
                total += this.estimateStringTokens(JSON.stringify(tool.inputSchema));
            }
        }

        const messages = this.getMessages(-1);
        for (const msg of messages) {
            const content = msg.content as string | unknown[];
            if (typeof content === 'string') {
                total += this.estimateStringTokens(content);
            } else if (Array.isArray(content)) {
                for (const block of content) {
                    if (typeof block === 'string') {
                        total += this.estimateStringTokens(block);
                    } else if (block && typeof block === 'object') {
                        const b = block as Record<string, unknown>;
                        if ('text' in b && typeof b.text === 'string') {
                            total += this.estimateStringTokens(b.text);
                        }
                        if ('input' in b) {
                            total += this.estimateStringTokens(JSON.stringify(b.input));
                        }
                        if ('content' in b) {
                            total += this.estimateStringTokens(
                                typeof b.content === 'string'
                                    ? b.content
                                    : JSON.stringify(b.content),
                            );
                        }
                    }
                }
            }
            total += 4;
        }

        return total;
    }

    getContextUsage(): { tokens: number; limit: number; percentage: number } {
        const tokens = this.estimateTokens();
        const limit = 200000;
        return {
            tokens,
            limit,
            percentage: Math.round((tokens / limit) * 100),
        };
    }

    async performCompaction(): Promise<string> {
        if (!isDbConnected()) {
            throw new Error('Database not connected');
        }

        const previousSummaryObj = await Summary.getLatest();
        const previousSummary = previousSummaryObj?.content;

        let summaryPrompt = `Create a comprehensive summary of the following conversation that preserves important context for future sessions.

Include:
- Key topics discussed and decisions made
- Important facts, preferences, or context about the user
- Technical details, code patterns, or architectural decisions
- Any ongoing projects or tasks and their current status
- Problems solved and how they were resolved
- Anything the user might want to reference later

Be thorough - this summary will be the primary context for future conversations. Write in a structured format with clear sections if needed. Target around 2000-2500 tokens - detailed but focused.`;

        if (previousSummary) {
            summaryPrompt += `\n\n---\nPrevious conversation history (incorporate relevant details):\n${previousSummary}`;
        }

        const currentMessages = this.getMessages(-1);
        const conversationText = currentMessages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
            .join('\n\n');

        const response = await this.openaiClient.chat.completions.create({
            model: this.config.settings.model,
            messages: [
                { role: 'system', content: summaryPrompt },
                {
                    role: 'user',
                    content: `Here is the conversation to summarize:\n\n${conversationText}`,
                },
            ],
            temperature: 0.7,
            max_tokens: 2500,
        });

        const summaryContent = response.choices[0]?.message?.content || '';
        const tokenEstimate = this.estimateTokens();

        await Summary.create({
            content: summaryContent,
            covers_until: new Date(),
            token_estimate: tokenEstimate,
            session_start: null,
            is_session_summary: false,
            message_count: null,
        });

        await Message.markAllCompacted();

        this.clearHistory();
        this.addMessage({
            role: 'system',
            content: `[Previous conversation summary]: ${summaryContent}`,
        });
        this.hasSummary = true;
        this.loadedMessages = [];
        this.loadedSkills.clear();

        return summaryContent;
    }

    async getMessageHistory(
        limit = 50,
    ): Promise<Array<{ role: string; content: string; created_at: string; medium?: string }>> {
        if (!isDbConnected()) return [];

        const messages = await Message.getRecent(limit);
        return messages.reverse().map((m) => ({
            role: m.role,
            content: m.content,
            created_at: String(m.created_at),
            medium: m.medium,
        }));
    }

    private async refreshMemoriesCache(): Promise<void> {
        if (!isDbConnected()) return;
        try {
            const coreMemories = await Memory.getCore();
            const recentMemories = await Memory.getRecentNonCore(15);

            const coreIds = new Set(coreMemories.map((m) => m.id));
            const combined = [...coreMemories, ...recentMemories.filter((m) => !coreIds.has(m.id))];

            this.memoriesCache = combined.map((m) => ({
                body: m.body,
                created_at: String(m.created_at),
            }));
        } catch (error) {
            console.error(chalk.dim(`[db] Failed to load memories`));
        }
    }

    private async refreshActionsCache(): Promise<void> {
        if (!isDbConnected()) return;
        try {
            const actions = await Action.getUpcoming();
            this.actionsCache = actions.map((a) => ({
                request: a.request,
                timestamp: String(a.timestamp),
            }));
        } catch (error) {
            console.error(chalk.dim(`[db] Failed to load actions`));
        }
    }

    async cleanup(): Promise<void> {
        this.proactivity.shutdown();
        processManager.cleanup();
        await this.mcpClient.disconnect();
    }

    private async loadUserInstructions(): Promise<void> {
        const neroMdPath = join(getConfigDir(), 'NERO.md');
        try {
            if (existsSync(neroMdPath)) {
                this.userInstructions = await readFile(neroMdPath, 'utf-8');
                console.log(chalk.dim(`[setup] Loaded NERO.md`));
            }
        } catch (error) {
            console.error(chalk.dim(`[setup] Failed to load NERO.md: ${(error as Error).message}`));
        }
    }

    async reload(newConfig: NeroConfig): Promise<{ mcpTools: number }> {
        this.proactivity.shutdown();
        await this.mcpClient.disconnect();
        this.config = newConfig;
        this.mcpClient = new McpClient(newConfig.mcpServers);
        this.proactivity = new ProactivityManager(newConfig);
        this.proactivity.setAgent(this);
        this.initSessionManager();
        await this.loadUserInstructions();
        await this.mcpClient.connect();
        const mcpTools = await this.mcpClient.getTools();
        return { mcpTools: mcpTools.length };
    }

    getSystemPrompts(): MagmaSystemMessageType[] {
        const memories = this.getCurrentMemories();
        const actions = this.getCurrentActions();
        const mcpToolsList = this.mcpClient.getToolNames();

        const isDocker = !!process.env.HOST_HOME;
        const homeDir = isDocker ? '/host/home' : homedir();
        const isGitRepo = existsSync(join(this.currentCwd, '.git'));

        const timezone =
            this.config.settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        const now = new Date();
        const localTime = now.toLocaleString('en-US', {
            timeZone: timezone,
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });

        const context: Record<string, any> = {
            time: {
                local: localTime,
                timezone: timezone,
                iso: now.toISOString(),
            },
            environment: {
                runtime: isDocker ? 'Docker container' : 'local',
                home: homeDir,
                cwd: this.currentCwd,
                gitRepo: isGitRepo
                    ? 'yes'
                    : 'NO - do not run git commands here, cd to a project first',
            },
        };

        if (memories.length > 0) {
            context.memories = memories.map((m) => ({
                content: m.body,
                date: m.created_at,
            }));
        }

        if (actions.length > 0) {
            context.scheduledActions = actions.map((a) => ({
                task: a.request,
                when: a.timestamp,
            }));
        }

        if (mcpToolsList.length > 0) {
            context.mcpTools = mcpToolsList;
        }

        if (this.pendingThoughts.length > 0) {
            context.backgroundThoughts = this.pendingThoughts.map((t) => ({
                thought: t.thought,
                when: t.created_at.toISOString(),
            }));
        }

        if (this.pendingNotes.length > 0) {
            context.notesForUser = this.pendingNotes.map((n) => ({
                content: n.content,
                category: n.category,
                when: n.created_at.toISOString(),
            }));
        }

        const contextPrompt = `## Current Context\n${toon(context)}`;

        const messages: { role: 'system'; content: string }[] = [
            { role: 'system', content: this.systemPrompt },
        ];

        if (this.userInstructions) {
            messages.push({
                role: 'system',
                content: `## User Instructions (from NERO.md)\n${this.userInstructions}`,
            });
        }

        const skillsContext = this.getSkillsContext();
        if (skillsContext) {
            messages.push({ role: 'system', content: skillsContext });
        }

        messages.push({ role: 'system', content: contextPrompt });

        if (this.currentMedium === 'voice') {
            messages.push({
                role: 'system',
                content: `## Voice Mode - CRITICAL FORMATTING RULES
You are on a PHONE CALL. Your response will be read aloud by text-to-speech.

NEVER use:
- Asterisks (*) for bold or emphasis - the TTS will say "asterisk"
- Markdown formatting of any kind (no **, no *, no #, no -, no bullets)
- URLs or links - describe the source instead ("on their website")
- Special characters that don't speak naturally

ALWAYS:
- Write in plain conversational English only
- Spell out symbols: @ as "at", & as "and", $ as "dollars", % as "percent"
- Keep responses concise - long responses are hard to follow verbally
- Use short sentences and natural speech patterns

This is non-negotiable. Plain text only.`,
            });
        }

        if (this.currentMedium === 'sms') {
            messages.push({
                role: 'system',
                content: `## SMS Mode Instructions
You are responding via text message. Keep responses brief and mobile-friendly.
- Be concise - SMS has character limits and people read on small screens
- Skip markdown formatting
- Get to the point quickly`,
            });
        }

        if (this.currentMedium === 'slack') {
            messages.push({
                role: 'system',
                content: `## Slack Mode Instructions
You are responding via Slack DM. Use Slack-friendly formatting:
- Use *bold* with single asterisks (not double)
- Use _italic_ with underscores
- Use \`code\` with backticks
- Use > for blockquotes
- Keep responses conversational but can be longer than SMS
- Emoji are fine to use sparingly`,
            });
        }

        return messages;
    }

    async chat(message: string, onChunk?: (chunk: string) => void): Promise<ChatResponse> {
        this._aborted = false;
        this.proactivity.onUserActivity();

        this.sessionManager?.onUserMessage();

        this.onChunk = onChunk;

        if (onChunk) {
            this.stream = true;
            this.onStreamChunk = (chunk) => {
                if (chunk?.delta?.content) {
                    onChunk(chunk.delta.content);
                }
            };
        } else {
            this.stream = false;
            this.onStreamChunk = () => {};
        }

        const unsurfacedThoughts = await this.proactivity.getUnsurfacedThoughts();
        if (unsurfacedThoughts.length > 0) {
            this.pendingThoughts = unsurfacedThoughts;
            await this.proactivity.markThoughtsSurfaced(unsurfacedThoughts.map((t) => t.id));
        } else {
            this.pendingThoughts = [];
        }

        const unsurfacedNotes = await this.proactivity.getUnsurfacedNotes();
        if (unsurfacedNotes.length > 0) {
            this.pendingNotes = unsurfacedNotes;
            await this.proactivity.markNotesSurfaced(unsurfacedNotes.map((n) => n.id));
        } else {
            this.pendingNotes = [];
        }

        this.addMessage({ role: 'user', content: message });

        this._isProcessing = true;
        try {
            const response = await this.main();

            await this.saveMessage('user', message);
            if (response?.content) {
                await this.saveMessage('assistant', response.content);
            }

            return {
                content: response?.content || '',
                streamed: !!onChunk,
            };
        } finally {
            this._isProcessing = false;
        }
    }

    clearHistory(): void {
        this.setMessages([]);
    }

    async runBackgroundThinking(
        recentThoughts: Array<{ thought: string; created_at: Date | string }>,
    ): Promise<string | null> {
        const savedMessages = this.getMessages();
        this.backgroundMode = true;
        this.stream = false;

        try {
            this.setMessages([]);

            const recentThoughtsText =
                recentThoughts.length > 0
                    ? recentThoughts
                          .map((t) => `- [${new Date(t.created_at).toLocaleString()}] ${t.thought}`)
                          .join('\n')
                    : '(none yet)';

            const recentMessages = await this.getMessageHistory(10);
            const recentMessagesText =
                recentMessages.length > 0
                    ? toon(
                          recentMessages.map((m) => ({
                              role: m.role,
                              content: m.content.slice(0, 500),
                          })),
                      )
                    : '(no recent messages)';

            const memories = this.getCurrentMemories().slice(0, 10);
            const memoriesText =
                memories.length > 0 ? toon(memories.map((m) => m.body)) : '(no memories)';

            const backgroundPrompt = `Run a background check. You have access to all your tools.

## Recent Notes You've Left
${recentThoughtsText}

## Recent Conversation
${recentMessagesText}

## User Memories
${memoriesText}

## Instructions
You're running in the background while the user is away. Use your tools to check on things that might be relevant.

**For git checks:** Your cwd is the user's home directory, NOT a git repo. To check git status, first use \`find ~/Desktop -maxdepth 3 -name .git -type d 2>/dev/null\` to locate project directories, then cd into specific projects before running git commands. Don't spam git status - pick 2-3 active projects max.

**For other checks:** Linear issues, calendar, running services, etc.

If you discover something the user should actually know about, use the note_for_user tool. Be very selective - most runs should result in zero notes.

**Save a note ONLY if:**
- You found a specific problem or bug
- You completed an action (created branch, fixed something, filed issue)
- Something changed that requires user attention (meeting moved, deploy failed)
- You discovered something unexpected they'd want to know

**DO NOT save notes about:**
- "All systems healthy" or "everything running fine" (don't report normalcy)
- "Checked X, no issues" (don't report what you checked)
- "Database running for X hours" (they don't care)
- "X active connections/studies/processes" (status updates are noise)
- General summaries of system state

The test: If you walked into a colleague's office to tell them this, would they thank you or wonder why you're wasting their time?

Your final response is for internal logging so future runs don't duplicate work. Write in plain text only - no markdown, no headers, no **bold**, no bullet points. Just sentences describing what you checked and found.

If something is URGENT (deploy failed, service down), start with [URGENT].`;

            this.addMessage({ role: 'user', content: backgroundPrompt });

            const response = await this.main();
            const thought = response?.content?.trim();

            if (!thought || thought === 'Nothing notable.' || thought === 'Nothing notable') {
                return null;
            }

            return thought;
        } finally {
            this.setMessages(savedMessages);
            this.backgroundMode = false;
        }
    }

    @tool({ description: 'Schedule an action to run at a specific time or on a recurring basis' })
    @toolparam({
        key: 'request',
        type: 'string',
        required: true,
        description: 'What to do when the action fires',
    })
    @toolparam({
        key: 'timestamp',
        type: 'string',
        required: true,
        description: 'ISO timestamp for when to run',
    })
    @toolparam({
        key: 'recurrence',
        type: 'string',
        required: false,
        description: 'Recurrence rule (daily, weekly, etc.)',
    })
    async scheduleAction(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const { request, timestamp, recurrence } = call.fn_args;

        await Action.create({
            request,
            timestamp: new Date(timestamp),
            recurrence: recurrence || null,
            steps: [],
        });
        await this.refreshActionsCache();

        return `Action scheduled for ${timestamp}${recurrence ? ` (${recurrence})` : ''}`;
    }

    @tool({ description: 'Search and retrieve memories relevant to the conversation' })
    async findMemories(_call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const messages = this.getMessages(5);
        const context = messages.map((m) => m.content).join(' ');

        const result = await db.query(
            `SELECT body, created_at FROM memories
             WHERE body ILIKE $1
             ORDER BY created_at DESC LIMIT 10`,
            [`%${context.slice(0, 100)}%`],
        );

        if (result.rows.length === 0) {
            return 'No relevant memories found.';
        }

        return result.rows.map((r) => `- ${r.body}`).join('\n');
    }

    @tool({ description: 'Execute an MCP tool by name with optional JSON arguments' })
    @toolparam({
        key: 'toolName',
        type: 'string',
        required: true,
        description: 'The MCP tool name (e.g. "filesystem:read_file")',
    })
    @toolparam({
        key: 'args',
        type: 'string',
        required: false,
        description: 'JSON string of arguments to pass to the tool',
    })
    async executeMcpTool(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const { toolName, args } = call.fn_args;
        let parsedArgs: Record<string, unknown> = {};
        if (args) {
            try {
                parsedArgs = JSON.parse(args);
            } catch {
                return `Error: Invalid JSON arguments: ${args}`;
            }
        }

        const approved = await this.requestPermission(toolName, parsedArgs, call.id);
        if (!approved) return 'Permission denied by user.';

        const activity: ToolActivity = {
            id: call.id,
            tool: toolName,
            args: parsedArgs,
            status: 'running',
        };
        this.emitActivity(activity);

        try {
            const result = await this.mcpClient.callTool(toolName, parsedArgs);
            activity.status = 'complete';
            activity.result = result.length > 100 ? result.slice(0, 100) + '...' : result;
            this.emitActivity(activity);
            return result;
        } catch (error) {
            activity.status = 'error';
            activity.error = (error as Error).message;
            this.emitActivity(activity);
            return `Error: ${activity.error}`;
        }
    }

    @tool({
        description:
            'Load a skill to get specialized instructions for a task. The skill will be added to your active context.',
    })
    @toolparam({
        key: 'name',
        type: 'string',
        required: true,
        description: 'The name of the skill to load',
    })
    @toolparam({
        key: 'args',
        type: 'array',
        items: { type: 'string' },
        required: false,
        description: 'Optional arguments to pass to the skill',
    })
    async skill(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const { name, args } = call.fn_args as { name: string; args?: string[] };

        const activity: ToolActivity = {
            id: call.id,
            tool: 'skill',
            displayName: `Skill: ${name}`,
            args: { name, args },
            status: 'running',
        };
        this.emitActivity(activity);

        try {
            if (this.loadedSkills.has(name)) {
                activity.status = 'complete';
                activity.result = `Skill already loaded: ${name}`;
                this.emitActivity(activity);
                return `Skill "${name}" is already loaded. Check the Active Skills section in your context.`;
            }

            const skill = await loadSkill(name);
            if (!skill) {
                const available = this.skillsCache.map((s) => s.name).join(', ');
                activity.status = 'error';
                activity.error = `Skill not found: ${name}`;
                this.emitActivity(activity);
                return `Error: Skill "${name}" not found. Available skills: ${available || 'none'}`;
            }

            this.loadedSkills.set(name, { skill, args: args || [] });

            activity.status = 'complete';
            activity.result = `Loaded skill: ${name}`;
            this.emitActivity(activity);

            return `Skill "${name}" loaded. Its instructions are now in your Active Skills context. Use \`unloadSkill\` when done.`;
        } catch (error) {
            activity.status = 'error';
            activity.error = (error as Error).message;
            this.emitActivity(activity);
            return `Error loading skill: ${activity.error}`;
        }
    }

    @tool({
        description:
            'Unload a skill when you are done using its instructions. This removes the skill from your active context to free up memory.',
    })
    @toolparam({
        key: 'name',
        type: 'string',
        required: true,
        description: 'The name of the skill to unload',
    })
    async unloadSkill(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const { name } = call.fn_args as { name: string };

        const activity: ToolActivity = {
            id: call.id,
            tool: 'unloadSkill',
            displayName: `Unload Skill: ${name}`,
            args: { name },
            status: 'running',
        };
        this.emitActivity(activity);

        if (!this.loadedSkills.has(name)) {
            activity.status = 'error';
            activity.error = `Skill not loaded: ${name}`;
            this.emitActivity(activity);
            const loaded = Array.from(this.loadedSkills.keys()).join(', ');
            return `Skill "${name}" is not currently loaded. Loaded skills: ${loaded || 'none'}`;
        }

        this.loadedSkills.delete(name);

        activity.status = 'complete';
        activity.result = `Unloaded skill: ${name}`;
        this.emitActivity(activity);

        return `Skill "${name}" unloaded. Its instructions have been removed from your active context.`;
    }

    private currentMedium: 'cli' | 'voice' | 'sms' | 'slack' | 'api' = 'cli';
    private currentCwd: string = process.env.HOST_HOME ? '/host/home' : process.cwd();

    setMedium(medium: 'cli' | 'voice' | 'sms' | 'slack' | 'api'): void {
        this.currentMedium = medium;
    }

    setCwd(cwd: string): void {
        this.currentCwd = cwd;
    }

    getCwd(): string {
        return this.currentCwd;
    }

    isProcessing(): boolean {
        return this._isProcessing;
    }

    abort(): void {
        this._aborted = true;
    }

    resetAbort(): void {
        this._aborted = false;
    }

    isAborted(): boolean {
        return this._aborted;
    }

    private resolvePath(inputPath: string): string {
        const hostHome = process.env.HOST_HOME || '';
        let resolved = inputPath;

        if (resolved.startsWith('~')) {
            resolved = hostHome
                ? resolved.replace('~', hostHome)
                : resolved.replace('~', homedir());
        }

        if (!resolved.startsWith('/')) {
            resolved = join(this.currentCwd, resolved);
        }

        return hostToContainer(resolved);
    }

    private async saveMessage(role: 'user' | 'assistant', content: string): Promise<void> {
        if (!isDbConnected() || this.backgroundMode) return;
        try {
            await Message.create({
                role,
                content,
                medium: this.currentMedium,
                compacted: false,
            });
        } catch (error) {
            const err = error as Error;
            console.error(chalk.dim(`[db] Failed to save message: ${err.message}`));
        }
    }

    private getCurrentMemories(): Array<{ body: string; created_at: string }> {
        return this.memoriesCache;
    }

    private getCurrentActions(): Array<{ request: string; timestamp: string }> {
        return this.actionsCache;
    }

    async getMemories(): Promise<Array<{ body: string; created_at: string }>> {
        const coreMemories = await Memory.getCore();
        const recentMemories = await Memory.getRecentNonCore(15);

        const coreIds = new Set(coreMemories.map((m) => m.id));
        const combined = [...coreMemories, ...recentMemories.filter((m) => !coreIds.has(m.id))];

        return combined.map((m) => ({
            body: m.body,
            created_at: String(m.created_at),
        }));
    }

    async getActions(): Promise<Array<{ request: string; timestamp: string }>> {
        const actions = await Action.getUpcoming();
        return actions.map((a) => ({
            request: a.request,
            timestamp: String(a.timestamp),
        }));
    }

    getMcpToolNames(): string[] {
        return this.mcpClient.getToolNames();
    }

    setModel(model: string): void {
        this.setProviderConfig({
            provider: 'openai',
            model,
            client: new OpenAI({
                baseURL: 'https://openrouter.ai/api/v1',
                apiKey: process.env.OPENROUTER_API_KEY!,
            }),
        });
    }

    setPermissionCallback(cb: PermissionCallback): void {
        this.onPermissionRequest = cb;
    }

    setActivityCallback(cb?: ActivityCallback): void {
        this.onActivity = cb;
    }

    private getCurrentBranch(): string | undefined {
        try {
            return execSync('git rev-parse --abbrev-ref HEAD', {
                encoding: 'utf-8',
                cwd: this.currentCwd,
                timeout: 5000,
                stdio: ['pipe', 'pipe', 'pipe'],
            }).trim();
        } catch {
            return undefined;
        }
    }

    private async requestPermission(
        tool: string,
        args: Record<string, any>,
        callId: string,
    ): Promise<boolean> {
        if (this._aborted) {
            const activity: ToolActivity = {
                id: callId,
                tool,
                args,
                status: 'skipped',
                skipReason: 'Request cancelled',
            };
            this.emitActivity(activity);
            return false;
        }

        if (this.backgroundMode) {
            if (this.config.proactivity.destructive) {
                return true;
            }

            const result = isDestructiveToolCall(
                { tool, args },
                this.config.proactivity.protectedBranches,
                this.getCurrentBranch(),
            );

            if (result.isDestructive) {
                console.log(
                    chalk.dim(
                        `[background] Skipping destructive action: ${tool} - ${result.reason}`,
                    ),
                );
                const activity: ToolActivity = {
                    id: callId,
                    tool,
                    args,
                    status: 'skipped',
                    skipReason: result.reason,
                };
                this.emitActivity(activity);
                return false;
            }

            return true;
        }

        if (!this.onPermissionRequest) return true;
        const activity: ToolActivity = { id: callId, tool, args, status: 'pending' };
        this.onActivity?.(activity);
        const approved = await this.onPermissionRequest(activity);
        activity.status = approved ? 'approved' : 'denied';
        this.onActivity?.(activity);
        return approved;
    }

    private emitActivity(activity: ToolActivity): void {
        if (!activity.displayName) {
            activity.displayName = formatToolName(activity.tool);
        }
        Logger.main.tool(activity);
        this.onActivity?.(activity);
    }

    @tool({ description: 'Read the contents of a file from the filesystem' })
    @toolparam({
        key: 'path',
        type: 'string',
        required: true,
        description: 'Path to the file to read',
    })
    @toolparam({
        key: 'limit',
        type: 'number',
        required: false,
        description: 'Max number of lines to read',
    })
    async readFile(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const { path, limit } = call.fn_args;
        const approved = await this.requestPermission('read', { path, limit }, call.id);
        if (!approved) return 'Permission denied by user.';

        const activity: ToolActivity = {
            id: call.id,
            tool: 'read',
            args: { path },
            status: 'running',
        };
        this.emitActivity(activity);

        try {
            const filePath = this.resolvePath(path);
            if (!existsSync(filePath)) {
                activity.status = 'error';
                activity.error = `File not found: ${path}`;
                this.emitActivity(activity);
                return activity.error;
            }
            const content = await readFile(filePath, 'utf-8');
            const lines = content.split('\n');
            const output = limit ? lines.slice(0, limit).join('\n') : content;
            activity.status = 'complete';
            activity.result = `Read ${lines.length} lines from ${path}`;
            this.emitActivity(activity);
            return output;
        } catch (error) {
            activity.status = 'error';
            activity.error = (error as Error).message;
            this.emitActivity(activity);
            return `Error: ${activity.error}`;
        }
    }

    @tool({ description: 'Write content to a file (creates or overwrites)' })
    @toolparam({ key: 'path', type: 'string', required: true, description: 'Path to write to' })
    @toolparam({ key: 'content', type: 'string', required: true, description: 'Content to write' })
    async writeToFile(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const { path, content } = call.fn_args;
        const filePath = this.resolvePath(path);

        let oldContent: string | null = null;
        try {
            if (existsSync(filePath)) {
                oldContent = await readFile(filePath, 'utf-8');
            }
        } catch {}

        const diff = generateDiff(oldContent, content);
        const isNewFile = oldContent === null;

        const approved = await this.requestPermission(
            'write',
            {
                path,
                oldContent,
                newContent: content,
                isNewFile,
            },
            call.id,
        );
        if (!approved) return 'Permission denied by user.';

        const activity: ToolActivity = {
            id: call.id,
            tool: 'write',
            args: {
                path,
                isNewFile,
                oldContent,
                newContent: content,
                linesAdded: diff.linesAdded,
                linesRemoved: diff.linesRemoved,
            },
            status: 'running',
        };
        this.emitActivity(activity);

        try {
            const parentDir = dirname(filePath);
            if (!existsSync(parentDir)) {
                await mkdir(parentDir, { recursive: true });
            }
            await writeFile(filePath, content, 'utf-8');
            activity.status = 'complete';
            activity.result = `Written ${content.length} bytes to ${path}`;
            this.emitActivity(activity);
            return activity.result;
        } catch (error) {
            activity.status = 'error';
            activity.error = (error as Error).message;
            this.emitActivity(activity);
            return `Error: ${activity.error}`;
        }
    }

    @tool({
        description:
            'Make a surgical edit to a file by replacing a specific string. More efficient than rewriting the entire file. The old_string must match exactly (including whitespace/indentation).',
    })
    @toolparam({ key: 'path', type: 'string', required: true, description: 'Path to the file' })
    @toolparam({
        key: 'old_string',
        type: 'string',
        required: true,
        description: 'The exact text to find and replace',
    })
    @toolparam({
        key: 'new_string',
        type: 'string',
        required: true,
        description: 'The text to replace it with',
    })
    async updateFile(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const { path, old_string, new_string } = call.fn_args;
        const filePath = this.resolvePath(path);

        let oldContent: string;
        try {
            oldContent = await readFile(filePath, 'utf-8');
        } catch (error) {
            return `Error: Could not read file: ${(error as Error).message}`;
        }

        if (!oldContent.includes(old_string)) {
            return `Error: Could not find the specified text in ${path}. Make sure old_string matches exactly, including whitespace and indentation.`;
        }

        const occurrences = oldContent.split(old_string).length - 1;
        if (occurrences > 1) {
            return `Error: Found ${occurrences} occurrences of the text. old_string must be unique. Add more surrounding context to make it unique.`;
        }

        const newContent = oldContent.replace(old_string, new_string);
        const diff = generateDiff(oldContent, newContent);

        const approved = await this.requestPermission(
            'update',
            {
                path,
                old_string,
                new_string,
                oldContent,
                newContent,
            },
            call.id,
        );
        if (!approved) return 'Permission denied by user.';

        const activity: ToolActivity = {
            id: call.id,
            tool: 'update',
            args: {
                path,
                oldContent,
                newContent,
                linesAdded: diff.linesAdded,
                linesRemoved: diff.linesRemoved,
            },
            status: 'running',
        };
        this.emitActivity(activity);

        try {
            await writeFile(filePath, newContent, 'utf-8');
            activity.status = 'complete';
            activity.result = `Updated ${path} (+${diff.linesAdded}/-${diff.linesRemoved} lines)`;
            this.emitActivity(activity);
            return activity.result;
        } catch (error) {
            activity.status = 'error';
            activity.error = (error as Error).message;
            this.emitActivity(activity);
            return `Error: ${activity.error}`;
        }
    }

    @tool({
        description:
            'Execute a bash command in the shell. Commands run in the current working directory. Use relative paths when possible.',
    })
    @toolparam({
        key: 'command',
        type: 'string',
        required: true,
        description: 'The bash command to execute',
    })
    async runBash(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        let { command } = call.fn_args;
        const approved = await this.requestPermission('bash', { command }, call.id);
        if (!approved) return 'Permission denied by user.';

        if (process.env.HOST_HOME) {
            command = command.replace(new RegExp(process.env.HOST_HOME, 'g'), '/host/home');
        }

        const activity: ToolActivity = {
            id: call.id,
            tool: 'bash',
            args: { command },
            status: 'running',
        };
        this.emitActivity(activity);

        try {
            const env = { ...process.env };
            if (process.env.HOST_HOME) {
                env.HOME = '/host/home';
                env.GIT_DISCOVERY_ACROSS_FILESYSTEM = '1';
            }

            const timeout = this.backgroundMode ? 10000 : 30000;
            let output: string;

            if (this.backgroundMode) {
                const result = await execAsync(command, {
                    encoding: 'utf-8',
                    timeout,
                    maxBuffer: 1024 * 1024 * 10,
                    cwd: this.currentCwd,
                    env,
                });
                output = result.stdout;
            } else {
                output = execSync(command, {
                    encoding: 'utf-8',
                    timeout,
                    maxBuffer: 1024 * 1024 * 10,
                    cwd: this.currentCwd,
                    env,
                    stdio: ['pipe', 'pipe', 'pipe'],
                });
            }

            if (process.env.HOST_HOME) {
                output = output.replace(/\/host\/home/g, process.env.HOST_HOME);
            }

            activity.status = 'complete';
            activity.result = output.trim();
            this.emitActivity(activity);
            return activity.result || '(no output)';
        } catch (error: any) {
            const stdout = error.stdout || '';
            const stderr = error.stderr || error.message;
            activity.status = 'error';
            activity.error = stderr;
            activity.result = stdout;
            this.emitActivity(activity);
            return `${stdout}\nError: ${stderr}`;
        }
    }

    @tool({ description: 'Search for a pattern in files using grep' })
    @toolparam({
        key: 'pattern',
        type: 'string',
        required: true,
        description: 'Regex pattern to search for',
    })
    @toolparam({
        key: 'path',
        type: 'string',
        required: false,
        description: 'Directory or file to search (default: cwd)',
    })
    @toolparam({
        key: 'fileType',
        type: 'string',
        required: false,
        description: 'File extension filter (e.g., "ts", "js")',
    })
    async grepSearch(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const { pattern, path, fileType } = call.fn_args;
        const searchPath = path ? this.resolvePath(path) : this.currentCwd;
        const displayPath = containerToHost(searchPath);
        const approved = await this.requestPermission(
            'grep',
            {
                pattern,
                path: displayPath,
                fileType,
            },
            call.id,
        );
        if (!approved) return 'Permission denied by user.';

        const activity: ToolActivity = {
            id: call.id,
            tool: 'grep',
            args: { pattern, path: displayPath },
            status: 'running',
        };
        this.emitActivity(activity);

        try {
            const typeFlag = fileType ? `--include="*.${fileType}"` : '';
            const output = execSync(
                `grep -r ${typeFlag} -n "${pattern}" ${searchPath} 2>/dev/null | head -50`,
                { encoding: 'utf-8' },
            );
            activity.status = 'complete';
            activity.result = `Found matches for "${pattern}"`;
            this.emitActivity(activity);
            const result = output.trim() || 'No matches found';
            return result.replace(/\/host\/home/g, process.env.HOST_HOME || '/host/home');
        } catch (error) {
            activity.status = 'complete';
            activity.result = 'No matches found';
            this.emitActivity(activity);
            return 'No matches found';
        }
    }

    @tool({ description: 'Change working directory for subsequent commands' })
    @toolparam({ key: 'path', type: 'string', required: true, description: 'Directory path' })
    async cd(call: MagmaToolCall): Promise<string> {
        const dirPath = this.resolvePath(call.fn_args.path);
        if (!existsSync(dirPath)) return `Error: ${call.fn_args.path} does not exist`;
        this.currentCwd = dirPath;
        const git = existsSync(join(dirPath, '.git'));
        return `${containerToHost(dirPath)}${git ? ' (git repo)' : ''}`;
    }

    @tool({ description: 'List files in a directory' })
    @toolparam({
        key: 'path',
        type: 'string',
        required: false,
        description: 'Directory path (default: cwd)',
    })
    async listFiles(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const { path } = call.fn_args;
        const dirPath = path ? this.resolvePath(path) : this.currentCwd;
        const displayPath = containerToHost(dirPath);
        const approved = await this.requestPermission('ls', { path: displayPath }, call.id);
        if (!approved) return 'Permission denied by user.';

        const activity: ToolActivity = {
            id: call.id,
            tool: 'ls',
            args: { path: displayPath },
            status: 'running',
        };
        this.emitActivity(activity);

        try {
            const entries = await readdir(dirPath, { withFileTypes: true });
            const output = entries
                .map((e) => `${e.isDirectory() ? 'd' : '-'} ${e.name}`)
                .join('\n');
            activity.status = 'complete';
            activity.result = `Listed ${entries.length} items`;
            this.emitActivity(activity);
            return output;
        } catch (error) {
            activity.status = 'error';
            activity.error = (error as Error).message;
            this.emitActivity(activity);
            return `Error: ${activity.error}`;
        }
    }

    @tool({ description: 'Find files matching a glob pattern' })
    @toolparam({
        key: 'pattern',
        type: 'string',
        required: true,
        description: 'File name pattern (e.g., "*.ts", "package.json")',
    })
    @toolparam({
        key: 'path',
        type: 'string',
        required: false,
        description: 'Directory to search in (default: cwd)',
    })
    async findFiles(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const { pattern, path } = call.fn_args;
        const searchPath = path ? this.resolvePath(path) : this.currentCwd;
        const displayPath = containerToHost(searchPath);
        const approved = await this.requestPermission(
            'find',
            { pattern, path: displayPath },
            call.id,
        );
        if (!approved) return 'Permission denied by user.';

        const activity: ToolActivity = {
            id: call.id,
            tool: 'find',
            args: { pattern, path: displayPath },
            status: 'running',
        };
        this.emitActivity(activity);

        try {
            const output = execSync(
                `find ${searchPath} -name "${pattern}" 2>/dev/null | head -50`,
                {
                    encoding: 'utf-8',
                },
            );
            activity.status = 'complete';
            activity.result = `Found files matching "${pattern}"`;
            this.emitActivity(activity);
            const result = output.trim() || 'No files found';
            return result.replace(/\/host\/home/g, process.env.HOST_HOME || '/host/home');
        } catch (error) {
            activity.status = 'complete';
            activity.result = 'No files found';
            this.emitActivity(activity);
            return 'No files found';
        }
    }

    @tool({ description: 'Store a memory or piece of information for later recall' })
    @toolparam({
        key: 'content',
        type: 'string',
        required: true,
        description: 'The information to remember',
    })
    @toolparam({
        key: 'core',
        type: 'boolean',
        required: false,
        description:
            'Set true for essential facts that should ALWAYS be in context (user identity, strong preferences). Use sparingly. Default: false',
    })
    async storeMemory(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const { content, core } = call.fn_args;

        if (!isDbConnected()) {
            return 'Cannot store memory: database not connected';
        }

        const activity: ToolActivity = {
            id: call.id,
            tool: 'memory',
            args: { content: content.slice(0, 50) + '...', core },
            status: 'running',
        };
        this.emitActivity(activity);

        try {
            await Memory.create({ body: content, related_to: [], category: core ? 'core' : null });
            await this.refreshMemoriesCache();
            activity.status = 'complete';
            activity.result = core ? 'Core memory stored' : 'Memory stored';
            this.emitActivity(activity);
            return core
                ? 'Core memory stored (will always be in context).'
                : 'Memory stored successfully.';
        } catch (error) {
            activity.status = 'error';
            activity.error = (error as Error).message;
            this.emitActivity(activity);
            return `Error storing memory: ${activity.error}`;
        }
    }

    @tool({
        description:
            'Add a note to surface to the user in their next briefing. Use this during background thinking to flag important discoveries, completed actions, or things the user should know about. Only use for genuinely useful information - not status updates or activity logs.',
    })
    @toolparam({
        key: 'note',
        type: 'string',
        required: true,
        description:
            'The note to surface to the user. Should be actionable or informative, e.g. "Found the auth bug in token refresh logic - created fix branch" not "Checked git status"',
    })
    @toolparam({
        key: 'category',
        type: 'string',
        required: false,
        description: 'Optional category: code, calendar, research, alert',
    })
    async noteForUser(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const { note, category } = call.fn_args;

        if (!isDbConnected()) {
            return 'Cannot store note: database not connected';
        }

        const activity: ToolActivity = {
            id: call.id,
            tool: 'note_for_user',
            args: { note: note.slice(0, 80) + (note.length > 80 ? '...' : '') },
            status: 'running',
        };
        this.emitActivity(activity);

        try {
            await Note.create({
                content: note,
                category: category || null,
                surfaced: false,
            });
            activity.status = 'complete';
            activity.result = 'Note saved';
            this.emitActivity(activity);
            return 'Note saved. Will be surfaced when user returns.';
        } catch (error) {
            activity.status = 'error';
            activity.error = (error as Error).message;
            this.emitActivity(activity);
            return `Error saving note: ${activity.error}`;
        }
    }

    @tool({
        description:
            'Search conversation history and past summaries for information from previous sessions',
    })
    @toolparam({
        key: 'query',
        type: 'string',
        required: true,
        description: 'Search term or phrase to find in history',
    })
    @toolparam({
        key: 'includeMessages',
        type: 'boolean',
        required: false,
        description: 'Include individual messages (default: true)',
    })
    @toolparam({
        key: 'includeSummaries',
        type: 'boolean',
        required: false,
        description: 'Include session summaries (default: true)',
    })
    @toolparam({
        key: 'limit',
        type: 'number',
        required: false,
        description: 'Max results to return (default: 20)',
    })
    async searchHistory(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const { query, includeMessages = true, includeSummaries = true, limit = 20 } = call.fn_args;

        if (!isDbConnected()) {
            return 'Cannot search history: database not connected';
        }

        const activity: ToolActivity = {
            id: call.id,
            tool: 'search_history',
            args: { query },
            status: 'running',
        };
        this.emitActivity(activity);

        try {
            const results: string[] = [];
            const searchPattern = `%${query}%`;

            if (includeSummaries) {
                const summaryResult = await db.query(
                    `SELECT content, created_at FROM summaries
                     WHERE content ILIKE $1
                     ORDER BY created_at DESC LIMIT $2`,
                    [searchPattern, Math.ceil(limit / 2)],
                );
                for (const row of summaryResult.rows) {
                    const date = new Date(row.created_at).toLocaleDateString();
                    results.push(`[Summary from ${date}]\n${row.content}\n`);
                }
            }

            if (includeMessages) {
                const messageResult = await db.query(
                    `SELECT role, content, created_at FROM messages
                     WHERE content ILIKE $1
                     ORDER BY created_at DESC LIMIT $2`,
                    [searchPattern, limit],
                );
                for (const row of messageResult.rows) {
                    const date = new Date(row.created_at).toLocaleString();
                    const role = row.role === 'user' ? 'User' : 'Nero';
                    results.push(
                        `[${date}] ${role}: ${row.content.slice(0, 300)}${row.content.length > 300 ? '...' : ''}`,
                    );
                }
            }

            activity.status = 'complete';
            activity.result = `Found ${results.length} results`;
            this.emitActivity(activity);

            if (results.length === 0) {
                return `No history found matching "${query}"`;
            }

            return results.join('\n---\n');
        } catch (error) {
            activity.status = 'error';
            activity.error = (error as Error).message;
            this.emitActivity(activity);
            return `Error searching history: ${activity.error}`;
        }
    }

    @tool({
        description:
            'Search the web for current information, news, documentation, or answers to questions',
    })
    @toolparam({ key: 'query', type: 'string', required: true, description: 'The search query' })
    async webSearch(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const { query } = call.fn_args;
        const approved = await this.requestPermission('web_search', { query }, call.id);
        if (!approved) return 'Permission denied by user.';

        const activity: ToolActivity = {
            id: call.id,
            tool: 'web_search',
            args: { query },
            status: 'running',
        };
        this.emitActivity(activity);

        const tavilyKey = process.env.TAVILY_API_KEY;
        if (!tavilyKey) {
            activity.status = 'error';
            activity.error = 'TAVILY_API_KEY not configured';
            this.emitActivity(activity);
            return 'Web search not available: TAVILY_API_KEY not set in environment.';
        }

        try {
            const response = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: tavilyKey,
                    query,
                    search_depth: 'basic',
                    include_answer: true,
                    max_results: 5,
                }),
            });

            if (!response.ok) {
                throw new Error(`Tavily API error: ${response.status}`);
            }

            const data = await response.json();

            let result = '';
            if (data.answer) {
                result += `**Answer:** ${data.answer}\n\n`;
            }

            if (data.results && data.results.length > 0) {
                result += '**Sources:**\n';
                for (const r of data.results.slice(0, 5)) {
                    result += `- [${r.title}](${r.url})\n  ${r.content?.slice(0, 200)}...\n\n`;
                }
            }

            activity.status = 'complete';
            activity.result = `Found ${data.results?.length || 0} results`;
            this.emitActivity(activity);
            return result || 'No results found.';
        } catch (error) {
            activity.status = 'error';
            activity.error = (error as Error).message;
            this.emitActivity(activity);
            return `Search error: ${activity.error}`;
        }
    }

    @tool({
        description: `Send a Slack message to the user. Supports plain text or rich Block Kit formatting.
For rich messages, use the blocks parameter with Slack Block Kit JSON array.
Common blocks: section (text), divider, header, context, image.
Example blocks: [{"type":"section","text":{"type":"mrkdwn","text":"*Bold* and _italic_"}}]`,
        enabled: (agent) => !!(agent as Nero).config.licenseKey,
    })
    @toolparam({
        key: 'text',
        type: 'string',
        required: true,
        description: 'Plain text message (also used as fallback for blocks)',
    })
    @toolparam({
        key: 'blocks',
        type: 'string',
        required: false,
        description: 'Optional Block Kit JSON array for rich formatting',
    })
    async sendSlackMessage(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const { text, blocks } = call.fn_args;

        const activity: ToolActivity = {
            id: call.id,
            tool: 'slack_message',
            args: { text: text.slice(0, 50) + '...' },
            status: 'running',
        };
        this.emitActivity(activity);

        let parsedBlocks: any[] | undefined;
        if (blocks) {
            try {
                parsedBlocks = JSON.parse(blocks);
            } catch {
                return 'Error: Invalid Block Kit JSON';
            }
        }

        try {
            const apiUrl = process.env.BACKEND_URL || 'https://api.magmadeploy.com';
            const response = await fetch(`${apiUrl}/v1/nero/send-slack`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-license-key': this.config.licenseKey,
                },
                body: JSON.stringify({ text, blocks: parsedBlocks }),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ message: response.statusText }));
                throw new Error(error.message || `HTTP ${response.status}`);
            }

            activity.status = 'complete';
            activity.result = 'Slack message sent';
            this.emitActivity(activity);
            return 'Message sent to user via Slack.';
        } catch (error) {
            activity.status = 'error';
            activity.error = (error as Error).message;
            this.emitActivity(activity);
            return `Failed to send Slack message: ${activity.error}`;
        }
    }

    @tool({
        description: 'Send an SMS text message to the user. Only available if SMS is configured.',
        enabled: (agent) => {
            const nero = agent as Nero;
            return !!(nero.config.licenseKey && nero.config.sms?.enabled);
        },
    })
    @toolparam({
        key: 'message',
        type: 'string',
        required: true,
        description: 'The message to send',
    })
    async sendSmsToUser(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const { message } = call.fn_args;

        const activity: ToolActivity = {
            id: call.id,
            tool: 'sms_message',
            args: { message: message.slice(0, 50) + '...' },
            status: 'running',
        };
        this.emitActivity(activity);

        try {
            const apiUrl = process.env.BACKEND_URL || 'https://api.magmadeploy.com';
            const response = await fetch(`${apiUrl}/v1/nero/send-sms`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-license-key': this.config.licenseKey,
                },
                body: JSON.stringify({ message }),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ message: response.statusText }));
                throw new Error(error.message || `HTTP ${response.status}`);
            }

            activity.status = 'complete';
            activity.result = 'SMS sent';
            this.emitActivity(activity);
            return 'SMS sent to user.';
        } catch (error) {
            activity.status = 'error';
            activity.error = (error as Error).message;
            this.emitActivity(activity);
            return `Failed to send SMS: ${activity.error}`;
        }
    }

    @tool({
        description: 'Initiate a voice call to the user. Only available if voice is configured.',
        enabled: (agent) => {
            const nero = agent as Nero;
            return !!(nero.config.licenseKey && nero.config.voice?.enabled);
        },
    })
    @toolparam({
        key: 'reason',
        type: 'string',
        required: false,
        description: 'Optional reason for the call (will be spoken when user answers)',
    })
    async callUser(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const { reason } = call.fn_args;

        const activity: ToolActivity = {
            id: call.id,
            tool: 'voice_call',
            args: { reason },
            status: 'running',
        };
        this.emitActivity(activity);

        try {
            const apiUrl = process.env.BACKEND_URL || 'https://api.magmadeploy.com';
            const response = await fetch(`${apiUrl}/v1/nero/call-user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-license-key': this.config.licenseKey,
                },
                body: JSON.stringify({ reason }),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ message: response.statusText }));
                throw new Error(error.message || `HTTP ${response.status}`);
            }

            activity.status = 'complete';
            activity.result = 'Call initiated';
            this.emitActivity(activity);
            return 'Voice call initiated to user.';
        } catch (error) {
            activity.status = 'error';
            activity.error = (error as Error).message;
            this.emitActivity(activity);
            return `Failed to initiate call: ${activity.error}`;
        }
    }

    @tool({ description: 'Fetch the contents of a URL and return the text or HTML' })
    @toolparam({ key: 'url', type: 'string', required: true, description: 'The URL to fetch' })
    @toolparam({
        key: 'format',
        type: 'string',
        required: false,
        description: 'Response format: "text", "json", or "html" (default: text)',
    })
    async fetchUrl(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const { url, format = 'text' } = call.fn_args;
        const approved = await this.requestPermission('fetch', { url }, call.id);
        if (!approved) return 'Permission denied by user.';

        const activity: ToolActivity = {
            id: call.id,
            tool: 'fetch',
            args: { url },
            status: 'running',
        };
        this.emitActivity(activity);

        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Nero/1.0 (AI Assistant)',
                    Accept: 'text/html,application/json,text/plain,*/*',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type') || '';
            let result: string;

            if (format === 'json' || contentType.includes('application/json')) {
                const json = await response.json();
                result = JSON.stringify(json, null, 2);
            } else {
                result = await response.text();
                if (result.length > 50000) {
                    result =
                        result.slice(0, 50000) + '\n\n[Content truncated - exceeded 50KB limit]';
                }
            }

            activity.status = 'complete';
            activity.result = `Fetched ${result.length} chars from ${new URL(url).hostname}`;
            this.emitActivity(activity);
            return result;
        } catch (error) {
            activity.status = 'error';
            activity.error = (error as Error).message;
            this.emitActivity(activity);
            return `Fetch error: ${activity.error}`;
        }
    }

    @tool({
        description: `Start a long-running background process. Use for commands that stream indefinitely (docker logs -f, tail -f, watch).

IMPORTANT: After starting, use getProcessOutput to check output and stopBackgroundProcess to stop it. Do NOT use bash to kill - use stopBackgroundProcess with the returned ID.`,
    })
    @toolparam({
        key: 'command',
        type: 'string',
        required: true,
        description: 'The command to run in the background',
    })
    @toolparam({
        key: 'timeout',
        type: 'number',
        required: false,
        description: 'Auto-kill after this many milliseconds (default: no timeout)',
    })
    async startBackgroundProcess(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const { command, timeout } = call.fn_args;
        const approved = await this.requestPermission('background_process', { command }, call.id);
        if (!approved) return 'Permission denied by user.';

        const activity: ToolActivity = {
            id: call.id,
            tool: 'startBackgroundProcess',
            args: { command },
            status: 'running',
        };
        this.emitActivity(activity);

        try {
            const procId = processManager.startProcess(command, {
                timeout,
                cwd: this.currentCwd,
            });

            await new Promise((resolve) => setTimeout(resolve, 500));

            const proc = processManager.getProcess(procId);
            if (proc?.status === 'error') {
                const output = processManager.getOutput(procId);
                activity.status = 'error';
                activity.error = 'Process failed to start';
                this.emitActivity(activity);
                return `Process failed to start:\n${output.join('\n')}`;
            }

            activity.status = 'complete';
            activity.result = `Started process ${procId}`;
            this.emitActivity(activity);

            const initialOutput = processManager.getOutput(procId, 10);
            const outputPreview =
                initialOutput.length > 0 ? `\n\nInitial output:\n${initialOutput.join('\n')}` : '';

            return `Process started: ${procId}${outputPreview}\n\nUse getProcessOutput("${procId}") to see more output, stopBackgroundProcess("${procId}") to stop.`;
        } catch (error) {
            activity.status = 'error';
            activity.error = (error as Error).message;
            this.emitActivity(activity);
            return `Error starting process: ${activity.error}`;
        }
    }

    @tool({
        description:
            'Get output from a background process started with startBackgroundProcess. Call this to check on long-running commands.',
    })
    @toolparam({
        key: 'processId',
        type: 'string',
        required: true,
        description: 'The process ID (e.g. "proc_1") returned by startBackgroundProcess',
    })
    @toolparam({
        key: 'lines',
        type: 'number',
        required: false,
        description: 'Number of lines to return (default: 50)',
    })
    async getProcessOutput(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const { processId, lines = 50 } = call.fn_args;

        const activity: ToolActivity = {
            id: call.id,
            tool: 'getProcessOutput',
            args: { processId, lines },
            status: 'running',
        };
        this.emitActivity(activity);

        const proc = processManager.getProcess(processId);
        if (!proc) {
            activity.status = 'error';
            activity.error = `Process ${processId} not found`;
            this.emitActivity(activity);
            return `Process ${processId} not found.`;
        }

        const output = processManager.getOutput(processId, lines);
        const status = proc.status;
        const exitInfo = proc.exitCode !== null ? ` (exit code: ${proc.exitCode})` : '';

        activity.status = 'complete';
        activity.result = `${status}${exitInfo}, ${output.length} lines`;
        this.emitActivity(activity);

        return `Process ${processId} [${status}${exitInfo}]:\n${output.join('\n') || '(no output yet)'}`;
    }

    @tool({
        description:
            'Stop a background process started with startBackgroundProcess. Use this instead of bash kill commands.',
    })
    @toolparam({
        key: 'processId',
        type: 'string',
        required: true,
        description: 'The process ID (e.g. "proc_1") to stop',
    })
    async stopBackgroundProcess(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const { processId } = call.fn_args;

        const activity: ToolActivity = {
            id: call.id,
            tool: 'stopBackgroundProcess',
            args: { processId },
            status: 'running',
        };
        this.emitActivity(activity);

        const proc = processManager.getProcess(processId);
        if (!proc) {
            activity.status = 'error';
            activity.error = `Process ${processId} not found`;
            this.emitActivity(activity);
            return `Process ${processId} not found.`;
        }

        if (proc.status !== 'running') {
            activity.status = 'complete';
            activity.result = `Already ${proc.status}`;
            this.emitActivity(activity);
            return `Process ${processId} is not running (status: ${proc.status}).`;
        }

        const stopped = processManager.stopProcess(processId);
        if (stopped) {
            activity.status = 'complete';
            activity.result = 'Process stopped';
            this.emitActivity(activity);
            return `Process ${processId} stopped.`;
        } else {
            activity.status = 'error';
            activity.error = 'Failed to stop';
            this.emitActivity(activity);
            return `Failed to stop process ${processId}.`;
        }
    }

    @tool({
        description:
            'List all background processes started with startBackgroundProcess, showing their status and runtime.',
    })
    async listBackgroundProcesses(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const activity: ToolActivity = {
            id: call.id,
            tool: 'listBackgroundProcesses',
            args: {},
            status: 'running',
        };
        this.emitActivity(activity);

        const processes = processManager.listProcesses();

        if (processes.length === 0) {
            activity.status = 'complete';
            activity.result = 'No processes';
            this.emitActivity(activity);
            return 'No background processes.';
        }

        const running = processes.filter((p) => p.status === 'running').length;
        activity.status = 'complete';
        activity.result = `${processes.length} processes (${running} running)`;
        this.emitActivity(activity);

        const lines = processes.map((p) => {
            const runtime = p.stoppedAt
                ? `ran for ${Math.round((p.stoppedAt.getTime() - p.startedAt.getTime()) / 1000)}s`
                : `running for ${Math.round((Date.now() - p.startedAt.getTime()) / 1000)}s`;
            const exitInfo = p.exitCode !== null ? ` (exit: ${p.exitCode})` : '';
            return `${p.id} [${p.status}${exitInfo}] ${runtime}\n  ${p.command}`;
        });

        return lines.join('\n\n');
    }
}
