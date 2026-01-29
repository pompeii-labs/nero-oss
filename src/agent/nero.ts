import { MagmaAgent } from '@pompeii-labs/magma';
import { tool, toolparam } from '@pompeii-labs/magma/decorators';
import type {
    MagmaMessage,
    MagmaToolCall,
    MagmaSystemMessageType,
} from '@pompeii-labs/magma/types';
import OpenAI from 'openai';
import chalk from 'chalk';
import { readFile, writeFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { encode as toon } from '@toon-format/toon';
import { NeroConfig } from '../config.js';
import { McpClient } from '../mcp/client.js';
import { db, isDbConnected } from '../db/index.js';
import { generateDiff } from '../util/diff.js';
import { hostToContainer, containerToHost } from '../util/paths.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ChatResponse {
    content: string;
    streamed: boolean;
}

export interface ToolActivity {
    tool: string;
    args: Record<string, any>;
    status: 'pending' | 'approved' | 'denied' | 'running' | 'complete' | 'error';
    result?: string;
    error?: string;
}

export type PermissionCallback = (activity: ToolActivity) => Promise<boolean>;
export type ActivityCallback = (activity: ToolActivity) => void;

export interface LoadedMessage {
    role: 'user' | 'assistant';
    content: string;
    created_at: string;
    medium?: 'cli' | 'api' | 'voice' | 'sms' | 'slack';
    isHistory?: boolean;
}

export class Nero extends MagmaAgent {
    config: NeroConfig;
    private mcpClient: McpClient;
    private openaiClient: OpenAI;
    private systemPrompt: string = '';
    private onChunk?: (chunk: string) => void;
    private onPermissionRequest?: PermissionCallback;
    private onActivity?: ActivityCallback;
    private memoriesCache: Array<{ body: string; created_at: string }> = [];
    private actionsCache: Array<{ request: string; timestamp: string }> = [];
    private loadedMessages: LoadedMessage[] = [];
    private hasSummary: boolean = false;

    constructor(config: NeroConfig) {
        const client = new OpenAI({
            baseURL: 'https://openrouter.ai/api/v1',
            apiKey: process.env.OPENROUTER_API_KEY!,
        });

        super({
            provider: 'openai',
            model: 'anthropic/claude-sonnet-4',
            client,
            settings: {
                temperature: 0.7,
            },
            messageContext: 50,
        });

        this.config = config;
        this.openaiClient = client;
        this.mcpClient = new McpClient(config.mcpServers);
    }

    async setup(): Promise<void> {
        const promptPath = join(__dirname, '../../prompts/main.txt');
        try {
            this.systemPrompt = await readFile(promptPath, 'utf-8');
        } catch {
            const altPath = join(process.cwd(), 'prompts/main.txt');
            this.systemPrompt = await readFile(altPath, 'utf-8');
        }

        await this.mcpClient.connect();

        const mcpTools = await this.mcpClient.getTools();
        console.log(chalk.dim(`[setup] Loaded ${mcpTools.length} MCP tools`));

        await this.loadRecentMessages(this.config.settings.historyLimit);
        await this.refreshMemoriesCache();
        await this.refreshActionsCache();
        if (this.memoriesCache.length > 0) {
            console.log(chalk.dim(`[setup] Loaded ${this.memoriesCache.length} memories`));
        }
    }

    private async loadRecentMessages(limit = 50): Promise<void> {
        if (!isDbConnected()) return;

        try {
            const summaryResult = await db.query(
                `SELECT content, covers_until FROM summaries ORDER BY created_at DESC LIMIT 1`,
            );

            if (summaryResult.rows.length > 0) {
                const summary = summaryResult.rows[0];
                this.hasSummary = true;
                this.addMessage({
                    role: 'system',
                    content: `[Previous conversation summary]: ${summary.content}`,
                });

                const messagesResult = await db.query(
                    `SELECT role, content, created_at, medium FROM messages
                     WHERE created_at > $1 AND compacted = FALSE
                     ORDER BY created_at ASC LIMIT $2`,
                    [summary.covers_until, limit],
                );

                this.loadedMessages = messagesResult.rows.map((row) => ({
                    role: row.role,
                    content: row.content,
                    created_at: row.created_at,
                    medium: row.medium,
                    isHistory: true,
                }));

                for (const row of messagesResult.rows) {
                    if (row.role === 'user' || row.role === 'assistant') {
                        this.addMessage({ role: row.role, content: row.content });
                    }
                }

                console.log(
                    chalk.dim(`[setup] Loaded summary + ${messagesResult.rows.length} messages`),
                );
            } else {
                const messagesResult = await db.query(
                    `SELECT role, content, created_at, medium FROM messages
                     ORDER BY created_at DESC LIMIT $1`,
                    [limit],
                );

                const messages = messagesResult.rows.reverse();
                this.loadedMessages = messages.map((row) => ({
                    role: row.role,
                    content: row.content,
                    created_at: row.created_at,
                    medium: row.medium,
                    isHistory: true,
                }));

                for (const row of messages) {
                    if (row.role === 'user' || row.role === 'assistant') {
                        this.addMessage({ role: row.role, content: row.content });
                    }
                }

                if (messages.length > 0) {
                    console.log(chalk.dim(`[setup] Loaded ${messages.length} previous messages`));
                }
            }
        } catch (error) {
            console.error(chalk.dim(`[db] Failed to load messages: ${(error as Error).message}`));
        }
    }

    getLoadedMessages(): LoadedMessage[] {
        return this.loadedMessages;
    }

    hasPreviousSummary(): boolean {
        return this.hasSummary;
    }

    estimateTokens(): number {
        const messages = this.getMessages();
        let total = 0;
        for (const msg of messages) {
            if (typeof msg.content === 'string') {
                total += Math.ceil(msg.content.length / 4);
            }
        }
        return total;
    }

    getContextUsage(): { tokens: number; limit: number; percentage: number } {
        const tokens = this.estimateTokens();
        const limit = 180000;
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

        const previousSummaryResult = await db.query(
            `SELECT content FROM summaries ORDER BY created_at DESC LIMIT 1`,
        );
        const previousSummary = previousSummaryResult.rows[0]?.content;

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

        const currentMessages = this.getMessages();
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

        const summary = response.choices[0]?.message?.content || '';
        const tokenEstimate = this.estimateTokens();

        await db.query(
            `INSERT INTO summaries (content, covers_until, token_estimate)
             VALUES ($1, NOW(), $2)`,
            [summary, tokenEstimate],
        );

        await db.query(`UPDATE messages SET compacted = TRUE WHERE compacted = FALSE`);

        this.clearHistory();
        this.addMessage({
            role: 'system',
            content: `[Previous conversation summary]: ${summary}`,
        });
        this.hasSummary = true;
        this.loadedMessages = [];

        return summary;
    }

    async getMessageHistory(
        limit = 50,
    ): Promise<Array<{ role: string; content: string; created_at: string; medium?: string }>> {
        if (!isDbConnected()) return [];

        const result = await db.query(
            `SELECT role, content, created_at, medium FROM messages
             ORDER BY created_at DESC LIMIT $1`,
            [limit],
        );

        return result.rows.reverse();
    }

    private async refreshMemoriesCache(): Promise<void> {
        if (!isDbConnected()) return;
        try {
            const result = await db.query(
                `SELECT body, created_at FROM memories ORDER BY created_at DESC LIMIT 20`,
            );
            this.memoriesCache = result.rows;
        } catch (error) {
            console.error(chalk.dim(`[db] Failed to load memories`));
        }
    }

    private async refreshActionsCache(): Promise<void> {
        if (!isDbConnected()) return;
        try {
            const result = await db.query(
                `SELECT request, timestamp FROM actions WHERE timestamp > NOW() ORDER BY timestamp ASC`,
            );
            this.actionsCache = result.rows;
        } catch (error) {
            console.error(chalk.dim(`[db] Failed to load actions`));
        }
    }

    async cleanup(): Promise<void> {
        await this.mcpClient.disconnect();
    }

    async reload(newConfig: NeroConfig): Promise<{ mcpTools: number }> {
        await this.mcpClient.disconnect();
        this.config = newConfig;
        this.mcpClient = new McpClient(newConfig.mcpServers);
        await this.mcpClient.connect();
        const mcpTools = await this.mcpClient.getTools();
        return { mcpTools: mcpTools.length };
    }

    getSystemPrompts(): MagmaSystemMessageType[] {
        const memories = this.getCurrentMemories();
        const actions = this.getCurrentActions();
        const mcpToolsList = this.mcpClient.getToolNames();

        const context: Record<string, any> = {
            time: new Date().toISOString(),
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

        const contextPrompt = `## Current Context\n${toon(context)}`;

        const messages: { role: 'system'; content: string }[] = [
            { role: 'system', content: this.systemPrompt },
            { role: 'system', content: contextPrompt },
        ];

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

        this.addMessage({ role: 'user', content: message });

        const response = await this.main();

        await this.saveMessage('user', message);
        if (response?.content) {
            await this.saveMessage('assistant', response.content);
        }

        return {
            content: response?.content || '',
            streamed: !!onChunk,
        };
    }

    clearHistory(): void {
        this.setMessages([]);
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

        await db.query(`INSERT INTO actions (request, timestamp, recurrence) VALUES ($1, $2, $3)`, [
            request,
            timestamp,
            recurrence || null,
        ]);
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

        const approved = await this.requestPermission(toolName, parsedArgs);
        if (!approved) return 'Permission denied by user.';

        const activity: ToolActivity = { tool: toolName, args: parsedArgs, status: 'running' };
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
        if (!isDbConnected()) return;
        try {
            await db.query(`INSERT INTO messages (role, content, medium) VALUES ($1, $2, $3)`, [
                role,
                content,
                this.currentMedium,
            ]);
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
        const result = await db.query(
            `SELECT body, created_at FROM memories ORDER BY created_at DESC LIMIT 20`,
        );
        return result.rows;
    }

    async getActions(): Promise<Array<{ request: string; timestamp: string }>> {
        const result = await db.query(
            `SELECT request, timestamp FROM actions WHERE timestamp > NOW() ORDER BY timestamp ASC`,
        );
        return result.rows;
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

    private async requestPermission(tool: string, args: Record<string, any>): Promise<boolean> {
        if (!this.onPermissionRequest) return true;
        const activity: ToolActivity = { tool, args, status: 'pending' };
        this.onActivity?.(activity);
        const approved = await this.onPermissionRequest(activity);
        activity.status = approved ? 'approved' : 'denied';
        this.onActivity?.(activity);
        return approved;
    }

    private emitActivity(activity: ToolActivity): void {
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
        const approved = await this.requestPermission('read', { path, limit });
        if (!approved) return 'Permission denied by user.';

        const activity: ToolActivity = { tool: 'read', args: { path }, status: 'running' };
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

        const approved = await this.requestPermission('write', {
            path,
            oldContent,
            newContent: content,
            isNewFile,
        });
        if (!approved) return 'Permission denied by user.';

        const activity: ToolActivity = {
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
            'Execute a bash command in the shell. Commands run in the current working directory. Use relative paths when possible.',
    })
    @toolparam({
        key: 'command',
        type: 'string',
        required: true,
        description: 'The bash command to execute',
    })
    async runBash(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const { command } = call.fn_args;
        const approved = await this.requestPermission('bash', { command });
        if (!approved) return 'Permission denied by user.';

        const activity: ToolActivity = { tool: 'bash', args: { command }, status: 'running' };
        this.emitActivity(activity);

        try {
            const env = { ...process.env };
            if (process.env.HOST_HOME) {
                env.HOME = '/host/home';
            }

            let output = execSync(command, {
                encoding: 'utf-8',
                timeout: 30000,
                maxBuffer: 1024 * 1024 * 10,
                cwd: this.currentCwd,
                env,
            });

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
        const approved = await this.requestPermission('grep', {
            pattern,
            path: displayPath,
            fileType,
        });
        if (!approved) return 'Permission denied by user.';

        const activity: ToolActivity = {
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
        const approved = await this.requestPermission('ls', { path: displayPath });
        if (!approved) return 'Permission denied by user.';

        const activity: ToolActivity = {
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
        const approved = await this.requestPermission('find', { pattern, path: displayPath });
        if (!approved) return 'Permission denied by user.';

        const activity: ToolActivity = {
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
    async storeMemory(call: MagmaToolCall, _agent: MagmaAgent): Promise<string> {
        const { content } = call.fn_args;

        if (!isDbConnected()) {
            return 'Cannot store memory: database not connected';
        }

        const activity: ToolActivity = {
            tool: 'memory',
            args: { content: content.slice(0, 50) + '...' },
            status: 'running',
        };
        this.emitActivity(activity);

        try {
            await db.query(`INSERT INTO memories (body) VALUES ($1)`, [content]);
            await this.refreshMemoriesCache();
            activity.status = 'complete';
            activity.result = 'Memory stored';
            this.emitActivity(activity);
            return 'Memory stored successfully.';
        } catch (error) {
            activity.status = 'error';
            activity.error = (error as Error).message;
            this.emitActivity(activity);
            return `Error storing memory: ${activity.error}`;
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
        const approved = await this.requestPermission('web_search', { query });
        if (!approved) return 'Permission denied by user.';

        const activity: ToolActivity = { tool: 'web_search', args: { query }, status: 'running' };
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

        const activity: ToolActivity = { tool: 'voice_call', args: { reason }, status: 'running' };
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
        const approved = await this.requestPermission('fetch', { url });
        if (!approved) return 'Permission denied by user.';

        const activity: ToolActivity = { tool: 'fetch', args: { url }, status: 'running' };
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
}
