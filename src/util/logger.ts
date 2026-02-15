import chalk from 'chalk';
import { appendFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { NERO_BLUE } from '../cli/theme.js';

export interface ToolActivity {
    tool: string;
    displayName?: string;
    args: Record<string, any>;
    status: 'pending' | 'approved' | 'denied' | 'skipped' | 'running' | 'complete' | 'error';
    result?: string;
    error?: string;
    skipReason?: string;
    subagentId?: string;
    subagentTask?: string;
    dispatchId?: string;
}

export function formatToolName(tool: string): string {
    const name = tool.includes(':') ? tool.split(':')[1] : tool;
    return name!
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR',
}

export interface LogEntry {
    timestamp: string;
    level: string;
    source: string;
    message: string;
    details?: object;
}

export type LogSubscriber = (entry: LogEntry) => void;

const BUFFER_MAX = 1000;

const IS_DEV = process.env.NODE_ENV !== 'production';

const buffer: LogEntry[] = [];
const subscribers = new Set<LogSubscriber>();
let logFilePath: string | null = null;
let fileReady = false;

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;
function stripAnsi(str: string): string {
    return str.replace(ANSI_RE, '');
}

function pushEntry(entry: LogEntry): void {
    buffer.push(entry);
    if (buffer.length > BUFFER_MAX) buffer.shift();
    for (const sub of subscribers) {
        try {
            sub(entry);
        } catch {}
    }
    if (fileReady && logFilePath) {
        const line = `${entry.timestamp} [${entry.source}][${entry.level}] ${entry.message}${entry.details ? ' ' + JSON.stringify(entry.details) : ''}\n`;
        appendFile(logFilePath, line).catch(() => {});
    }
}

export function initLogFile(neroHome: string): void {
    const logsDir = join(neroHome, '.nero', 'logs');
    logFilePath = join(logsDir, 'nero.log');
    if (!existsSync(logsDir)) {
        mkdir(logsDir, { recursive: true })
            .then(() => {
                fileReady = true;
            })
            .catch(() => {});
    } else {
        fileReady = true;
    }
}

export function getLogFilePath(): string | null {
    return logFilePath;
}

export function getRecentLogs(count = 100, level?: string): LogEntry[] {
    let filtered = buffer;
    if (level) {
        const upper = level.toUpperCase();
        filtered = buffer.filter((e) => e.level === upper);
    }
    return filtered.slice(-count);
}

export function subscribeToLogs(fn: LogSubscriber): () => void {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
}

export class Logger {
    private name: string;

    static main = new Logger('Nero');

    constructor(name: string) {
        this.name = name;
    }

    debug(message: string, details?: object) {
        if (!IS_DEV) return;
        const detailsStr = details ? ` ${chalk.dim(JSON.stringify(details))}` : '';
        console.log(
            `[${chalk.gray.bold(this.name)}][${chalk.gray('DEBUG')}] ${chalk.dim(message)}${detailsStr}`,
        );
        pushEntry({
            timestamp: new Date().toISOString(),
            level: LogLevel.DEBUG,
            source: this.name,
            message: stripAnsi(message),
            details,
        });
    }

    info(message: string, details?: object) {
        const detailsStr = details ? ` ${chalk.dim(JSON.stringify(details))}` : '';
        console.log(
            `[${chalk.blue.bold(this.name)}][${chalk.cyan('INFO')}] ${message}${detailsStr}`,
        );
        pushEntry({
            timestamp: new Date().toISOString(),
            level: LogLevel.INFO,
            source: this.name,
            message: stripAnsi(message),
            details,
        });
    }

    warn(message: string, details?: object) {
        if (!IS_DEV) return;
        const detailsStr = details ? ` ${chalk.dim(JSON.stringify(details))}` : '';
        console.log(
            `[${chalk.yellow.bold(this.name)}][${chalk.yellow('WARN')}] ${chalk.yellow(message)}${detailsStr}`,
        );
        pushEntry({
            timestamp: new Date().toISOString(),
            level: LogLevel.WARN,
            source: this.name,
            message: stripAnsi(message),
            details,
        });
    }

    error(message: string | Error, details?: object) {
        const msg = message instanceof Error ? message.message : message;
        const detailsStr = details ? ` ${chalk.dim(JSON.stringify(details))}` : '';
        console.log(
            `[${chalk.red.bold(this.name)}][${chalk.red('ERROR')}] ${chalk.red(msg)}${detailsStr}`,
        );
        pushEntry({
            timestamp: new Date().toISOString(),
            level: LogLevel.ERROR,
            source: this.name,
            message: stripAnsi(msg),
            details,
        });
    }

    success(message: string, details?: object) {
        const detailsStr = details ? ` ${chalk.dim(JSON.stringify(details))}` : '';
        console.log(
            `[${chalk.green.bold(this.name)}][${chalk.green('OK')}] ${chalk.green(message)}${detailsStr}`,
        );
        pushEntry({
            timestamp: new Date().toISOString(),
            level: LogLevel.INFO,
            source: this.name,
            message: stripAnsi(message),
            details,
        });
    }

    tool(activity: ToolActivity) {
        const toolName = activity.displayName || formatToolName(activity.tool);
        const argPreview = this.getArgPreview(activity.args);

        if (activity.status === 'running') {
            console.log(
                `[${chalk.hex(NERO_BLUE).bold('Nero')}][${chalk.white('TOOL')}] ${toolName}${argPreview ? chalk.dim(` ${argPreview}`) : ''}`,
            );
            pushEntry({
                timestamp: new Date().toISOString(),
                level: 'TOOL',
                source: 'Nero',
                message: `${toolName}${argPreview ? ` ${argPreview}` : ''}`,
            });
        } else if (activity.status === 'complete') {
            const resultPreview = activity.result
                ? chalk.dim(
                      ` ${activity.result.slice(0, 60).replace(/\n/g, ' ')}${activity.result.length > 60 ? '...' : ''}`,
                  )
                : '';
            console.log(
                `[${chalk.hex(NERO_BLUE).bold('Nero')}][${chalk.green('DONE')}] ${toolName}${resultPreview}`,
            );
            const plainResult = activity.result
                ? ` ${activity.result.slice(0, 60).replace(/\n/g, ' ')}${activity.result.length > 60 ? '...' : ''}`
                : '';
            pushEntry({
                timestamp: new Date().toISOString(),
                level: 'TOOL',
                source: 'Nero',
                message: `[DONE] ${toolName}${plainResult}`,
            });
        } else if (activity.status === 'error') {
            console.log(
                `[${chalk.hex(NERO_BLUE).bold('Nero')}][${chalk.red('FAIL')}] ${toolName} ${chalk.red(activity.error || 'Unknown error')}`,
            );
            pushEntry({
                timestamp: new Date().toISOString(),
                level: LogLevel.ERROR,
                source: 'Nero',
                message: `[FAIL] ${toolName} ${activity.error || 'Unknown error'}`,
            });
        } else if (activity.status === 'skipped') {
            console.log(
                `[${chalk.hex(NERO_BLUE).bold('Nero')}][${chalk.yellow('SKIP')}] ${toolName} ${chalk.yellow(activity.skipReason || '')}`,
            );
            pushEntry({
                timestamp: new Date().toISOString(),
                level: LogLevel.WARN,
                source: 'Nero',
                message: `[SKIP] ${toolName} ${activity.skipReason || ''}`,
            });
        }
    }

    private getArgPreview(args: Record<string, any>): string {
        const mainArg = Object.entries(args).find(
            ([key]) =>
                !['isNewFile', 'linesAdded', 'linesRemoved', 'oldContent', 'newContent'].includes(
                    key,
                ),
        );
        if (!mainArg) return '';

        const value = mainArg[1];
        if (typeof value === 'string') {
            return value.length > 50 ? value.slice(0, 50) + '...' : value;
        }
        if (typeof value === 'object' && value !== null) {
            const str = JSON.stringify(value);
            return str.length > 50 ? str.slice(0, 50) + '...' : str;
        }
        return String(value);
    }
}
