import { MagmaAgent } from '@pompeii-labs/magma';
import { tool, toolparam } from '@pompeii-labs/magma/decorators';
import type { MagmaToolCall, MagmaSystemMessageType } from '@pompeii-labs/magma/types';
import OpenAI from 'openai';
import { readFile, writeFile, readdir, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname, extname } from 'path';
import { homedir } from 'os';
import { hostToContainer, containerToHost } from '../util/paths.js';

export function resolveToolPath(inputPath: string, cwd: string): string {
    const hostHome = process.env.HOST_HOME || '';
    let resolved = inputPath;

    if (resolved.startsWith('~')) {
        resolved = hostHome ? resolved.replace('~', hostHome) : resolved.replace('~', homedir());
    }

    if (!resolved.startsWith('/')) {
        resolved = join(cwd, resolved);
    }

    return hostToContainer(resolved);
}

export interface SubagentTask {
    id: string;
    task: string;
    mode: 'research' | 'build';
    model?: string;
}

export interface SubagentConfig {
    task: SubagentTask;
    model: string;
    client: OpenAI;
    cwd: string;
    onToolUse?: (
        toolName: string,
        args: Record<string, unknown>,
        status: string,
        result?: string,
    ) => void;
}

const MAX_TOOL_OUTPUT = 10000;

function truncateResult(result: string): string {
    if (result.length > MAX_TOOL_OUTPUT) {
        return result.slice(0, MAX_TOOL_OUTPUT) + '\n\n[Output truncated]';
    }
    return result;
}

class ResearchAgent extends MagmaAgent {
    protected cwd: string;
    protected onToolUse?: SubagentConfig['onToolUse'];

    constructor(config: SubagentConfig) {
        const effectiveModel = config.task.model || config.model;
        super({
            provider: 'openai',
            model: effectiveModel,
            client: config.client,
            settings: { temperature: 0.3 },
            messageContext: -1,
        });
        this.cwd = config.cwd;
        this.onToolUse = config.onToolUse;
    }

    protected resolvePath(inputPath: string): string {
        return resolveToolPath(inputPath, this.cwd);
    }

    getSystemPrompts(): MagmaSystemMessageType[] {
        return [
            {
                role: 'system',
                content: `You are a focused research agent. Your task is to investigate and report findings. You have access to file reading, directory listing, search, and fetch tools. Be thorough but efficient. Report your findings clearly. Working directory: ${containerToHost(this.cwd)}`,
            },
        ];
    }

    @tool({ description: 'Read the contents of a file. Supports text and PDF files.' })
    @toolparam({ key: 'path', type: 'string', required: true, description: 'Path to the file' })
    @toolparam({
        key: 'limit',
        type: 'number',
        required: false,
        description: 'Max lines to read (text only)',
    })
    async readFile(call: MagmaToolCall): Promise<string> {
        const { path: inputPath, limit } = call.fn_args;
        this.onToolUse?.('readFile', call.fn_args, 'running');

        const filePath = this.resolvePath(inputPath);
        if (!existsSync(filePath)) {
            const err = `Error: File not found: ${inputPath}`;
            this.onToolUse?.('readFile', call.fn_args, 'complete', err);
            return err;
        }

        const ext = extname(filePath).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
            const err = 'Error: Cannot read image files in subagent context';
            this.onToolUse?.('readFile', call.fn_args, 'complete', err);
            return err;
        }

        if (ext === '.pdf') {
            try {
                const buffer = await readFile(filePath);
                const { PDFParse } = await import('pdf-parse');
                const parser = new PDFParse({ data: new Uint8Array(buffer) });
                const pdfResult = await parser.getText();
                await parser.destroy();
                const result = truncateResult(pdfResult.text);
                this.onToolUse?.(
                    'readFile',
                    call.fn_args,
                    'complete',
                    `Extracted ${pdfResult.text.length} chars from PDF`,
                );
                return result;
            } catch (error) {
                const err = `Error reading PDF: ${(error as Error).message}`;
                this.onToolUse?.('readFile', call.fn_args, 'complete', err);
                return err;
            }
        }

        try {
            const content = await readFile(filePath, 'utf-8');
            const lines = content.split('\n');
            const output = limit ? lines.slice(0, limit).join('\n') : content;
            const result = truncateResult(output);
            this.onToolUse?.(
                'readFile',
                call.fn_args,
                'complete',
                `Read ${lines.length} lines from ${inputPath}`,
            );
            return result;
        } catch (error) {
            const err = `Error: ${(error as Error).message}`;
            this.onToolUse?.('readFile', call.fn_args, 'complete', err);
            return err;
        }
    }

    @tool({ description: 'List files and directories in a path.' })
    @toolparam({
        key: 'path',
        type: 'string',
        required: false,
        description: 'Directory path (default: cwd)',
    })
    async listDir(call: MagmaToolCall): Promise<string> {
        const { path } = call.fn_args;
        this.onToolUse?.('listDir', call.fn_args, 'running');

        const dirPath = path ? this.resolvePath(path) : this.cwd;
        try {
            const entries = await readdir(dirPath, { withFileTypes: true });
            const result = entries
                .map((e) => `${e.isDirectory() ? 'd' : '-'} ${e.name}`)
                .join('\n');
            this.onToolUse?.('listDir', call.fn_args, 'complete', `Listed ${entries.length} items`);
            return result;
        } catch (error) {
            const err = `Error: ${(error as Error).message}`;
            this.onToolUse?.('listDir', call.fn_args, 'complete', err);
            return err;
        }
    }

    @tool({ description: 'Find files matching a glob pattern.' })
    @toolparam({
        key: 'pattern',
        type: 'string',
        required: true,
        description: 'File name pattern (e.g., "*.ts")',
    })
    @toolparam({
        key: 'path',
        type: 'string',
        required: false,
        description: 'Directory to search (default: cwd)',
    })
    async findFiles(call: MagmaToolCall): Promise<string> {
        const { pattern, path } = call.fn_args;
        this.onToolUse?.('findFiles', call.fn_args, 'running');

        const searchPath = path ? this.resolvePath(path) : this.cwd;
        try {
            const output = execSync(
                `find ${searchPath} -name "${pattern}" 2>/dev/null | head -50`,
                { encoding: 'utf-8' },
            );
            const result = (output.trim() || 'No files found').replace(
                /\/host\/home/g,
                process.env.HOST_HOME || '/host/home',
            );
            this.onToolUse?.(
                'findFiles',
                call.fn_args,
                'complete',
                result.split('\n').length + ' files found',
            );
            return truncateResult(result);
        } catch {
            this.onToolUse?.('findFiles', call.fn_args, 'complete', 'No files found');
            return 'No files found';
        }
    }

    @tool({ description: 'Search for a pattern in files using grep.' })
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
        description: 'File extension filter (e.g., "ts")',
    })
    async grep(call: MagmaToolCall): Promise<string> {
        const { pattern, path, fileType } = call.fn_args;
        this.onToolUse?.('grep', call.fn_args, 'running');

        const searchPath = path ? this.resolvePath(path) : this.cwd;
        try {
            const typeFlag = fileType ? `--include="*.${fileType}"` : '';
            const output = execSync(
                `grep -r ${typeFlag} -n "${pattern}" ${searchPath} 2>/dev/null | head -50`,
                { encoding: 'utf-8' },
            );
            const result = (output.trim() || 'No matches found').replace(
                /\/host\/home/g,
                process.env.HOST_HOME || '/host/home',
            );
            this.onToolUse?.('grep', call.fn_args, 'complete', `Found matches for "${pattern}"`);
            return truncateResult(result);
        } catch {
            this.onToolUse?.('grep', call.fn_args, 'complete', 'No matches found');
            return 'No matches found';
        }
    }

    @tool({ description: 'Fetch the contents of a URL.' })
    @toolparam({ key: 'url', type: 'string', required: true, description: 'The URL to fetch' })
    @toolparam({
        key: 'format',
        type: 'string',
        required: false,
        description: '"text", "json", or "html" (default: text)',
    })
    async fetchUrl(call: MagmaToolCall): Promise<string> {
        const { url, format = 'text' } = call.fn_args;
        this.onToolUse?.('fetch', call.fn_args, 'running');

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

            this.onToolUse?.(
                'fetch',
                call.fn_args,
                'complete',
                `Fetched ${result.length} chars from ${new URL(url).hostname}`,
            );
            return truncateResult(result);
        } catch (error) {
            const err = `Fetch error: ${(error as Error).message}`;
            this.onToolUse?.('fetch', call.fn_args, 'complete', err);
            return err;
        }
    }
}

class BuildAgent extends ResearchAgent {
    constructor(config: SubagentConfig) {
        super(config);
    }

    getSystemPrompts(): MagmaSystemMessageType[] {
        return [
            {
                role: 'system',
                content: `You are a focused build agent. Your task is to implement changes as described. You have access to file reading, writing, editing, search, and bash tools. Work efficiently: read what you need, make changes, verify. Do not ask questions - make reasonable decisions and proceed. Working directory: ${containerToHost(this.cwd)}`,
            },
        ];
    }

    @tool({ description: 'Write content to a file (creates or overwrites).' })
    @toolparam({ key: 'path', type: 'string', required: true, description: 'Path to write to' })
    @toolparam({ key: 'content', type: 'string', required: true, description: 'Content to write' })
    async writeFile(call: MagmaToolCall): Promise<string> {
        const { path: inputPath, content } = call.fn_args;
        this.onToolUse?.('writeFile', call.fn_args, 'running');

        const filePath = this.resolvePath(inputPath);
        try {
            const parentDir = dirname(filePath);
            if (!existsSync(parentDir)) {
                await mkdir(parentDir, { recursive: true });
            }
            await writeFile(filePath, content, 'utf-8');
            const result = `Written ${content.length} bytes to ${inputPath}`;
            this.onToolUse?.('writeFile', call.fn_args, 'complete', result);
            return result;
        } catch (error) {
            const err = `Error: ${(error as Error).message}`;
            this.onToolUse?.('writeFile', call.fn_args, 'complete', err);
            return err;
        }
    }

    @tool({
        description:
            'Make a surgical edit by replacing a specific string. old_string must match exactly and be unique.',
    })
    @toolparam({ key: 'path', type: 'string', required: true, description: 'Path to the file' })
    @toolparam({
        key: 'old_string',
        type: 'string',
        required: true,
        description: 'Exact text to find and replace',
    })
    @toolparam({
        key: 'new_string',
        type: 'string',
        required: true,
        description: 'Text to replace it with',
    })
    async updateFile(call: MagmaToolCall): Promise<string> {
        const { path: inputPath, old_string, new_string } = call.fn_args;
        this.onToolUse?.('updateFile', call.fn_args, 'running');

        const filePath = this.resolvePath(inputPath);
        let oldContent: string;
        try {
            oldContent = await readFile(filePath, 'utf-8');
        } catch (error) {
            const err = `Error: Could not read file: ${(error as Error).message}`;
            this.onToolUse?.('updateFile', call.fn_args, 'complete', err);
            return err;
        }

        if (!oldContent.includes(old_string)) {
            const err = `Error: Could not find the specified text in ${inputPath}. Make sure old_string matches exactly.`;
            this.onToolUse?.('updateFile', call.fn_args, 'complete', err);
            return err;
        }

        const occurrences = oldContent.split(old_string).length - 1;
        if (occurrences > 1) {
            const err = `Error: Found ${occurrences} occurrences. old_string must be unique. Add more context.`;
            this.onToolUse?.('updateFile', call.fn_args, 'complete', err);
            return err;
        }

        const newContent = oldContent.replace(old_string, new_string);
        try {
            await writeFile(filePath, newContent, 'utf-8');
            const result = `Updated ${inputPath}`;
            this.onToolUse?.('updateFile', call.fn_args, 'complete', result);
            return result;
        } catch (error) {
            const err = `Error: ${(error as Error).message}`;
            this.onToolUse?.('updateFile', call.fn_args, 'complete', err);
            return err;
        }
    }

    @tool({ description: 'Execute a bash command. 30 second timeout.' })
    @toolparam({
        key: 'command',
        type: 'string',
        required: true,
        description: 'The command to execute',
    })
    async bash(call: MagmaToolCall): Promise<string> {
        const { command } = call.fn_args;
        this.onToolUse?.('bash', call.fn_args, 'running');

        try {
            const env = { ...process.env };
            if (process.env.HOST_HOME) {
                env.HOME = '/host/home';
                env.GIT_DISCOVERY_ACROSS_FILESYSTEM = '1';
            }

            const output = execSync(command, {
                encoding: 'utf-8',
                timeout: 30000,
                maxBuffer: 1024 * 1024 * 10,
                cwd: this.cwd,
                env,
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            let result = output;
            if (process.env.HOST_HOME) {
                result = result.replace(/\/host\/home/g, process.env.HOST_HOME);
            }

            result = result.trim() || '(no output)';
            this.onToolUse?.('bash', call.fn_args, 'complete', result.slice(0, 200));
            return truncateResult(result);
        } catch (error: any) {
            const stdout = error.stdout || '';
            const stderr = error.stderr || error.message;
            const result = `${stdout}\nError: ${stderr}`;
            this.onToolUse?.('bash', call.fn_args, 'complete', result.slice(0, 200));
            return truncateResult(result);
        }
    }
}

export async function runSubagent(config: SubagentConfig): Promise<string> {
    const agent = config.task.mode === 'build' ? new BuildAgent(config) : new ResearchAgent(config);

    agent.addMessage({ role: 'user', content: config.task.task });

    const response = await agent.main();
    return response?.content || '(no response)';
}
