import chalk from 'chalk';
import { NERO_BLUE } from '../cli/theme.js';

interface ToolActivity {
    tool: string;
    args: Record<string, any>;
    status: 'pending' | 'approved' | 'denied' | 'running' | 'complete' | 'error';
    result?: string;
    error?: string;
}

export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR',
}

const IS_DEV = process.env.NODE_ENV !== 'production';

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
    }

    info(message: string, details?: object) {
        const detailsStr = details ? ` ${chalk.dim(JSON.stringify(details))}` : '';
        console.log(
            `[${chalk.blue.bold(this.name)}][${chalk.cyan('INFO')}] ${message}${detailsStr}`,
        );
    }

    warn(message: string, details?: object) {
        if (!IS_DEV) return;
        const detailsStr = details ? ` ${chalk.dim(JSON.stringify(details))}` : '';
        console.log(
            `[${chalk.yellow.bold(this.name)}][${chalk.yellow('WARN')}] ${chalk.yellow(message)}${detailsStr}`,
        );
    }

    error(message: string | Error, details?: object) {
        const msg = message instanceof Error ? message.message : message;
        const detailsStr = details ? ` ${chalk.dim(JSON.stringify(details))}` : '';
        console.log(
            `[${chalk.red.bold(this.name)}][${chalk.red('ERROR')}] ${chalk.red(msg)}${detailsStr}`,
        );
    }

    success(message: string, details?: object) {
        const detailsStr = details ? ` ${chalk.dim(JSON.stringify(details))}` : '';
        console.log(
            `[${chalk.green.bold(this.name)}][${chalk.green('OK')}] ${chalk.green(message)}${detailsStr}`,
        );
    }

    tool(activity: ToolActivity) {
        const toolName = this.formatToolName(activity.tool);
        const argPreview = this.getArgPreview(activity.args);

        if (activity.status === 'running') {
            console.log(
                `[${chalk.hex(NERO_BLUE).bold('Nero')}][${chalk.white('TOOL')}] ${toolName}${argPreview ? chalk.dim(` ${argPreview}`) : ''}`,
            );
        } else if (activity.status === 'complete') {
            const resultPreview = activity.result
                ? chalk.dim(` ${activity.result.slice(0, 60).replace(/\n/g, ' ')}${activity.result.length > 60 ? '...' : ''}`)
                : '';
            console.log(
                `[${chalk.hex(NERO_BLUE).bold('Nero')}][${chalk.green('DONE')}] ${toolName}${resultPreview}`,
            );
        } else if (activity.status === 'error') {
            console.log(
                `[${chalk.hex(NERO_BLUE).bold('Nero')}][${chalk.red('FAIL')}] ${toolName} ${chalk.red(activity.error || 'Unknown error')}`,
            );
        }
    }

    private formatToolName(tool: string): string {
        const name = tool.includes(':') ? tool.split(':')[1] : tool;
        return name!
            .replace(/_/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    private getArgPreview(args: Record<string, any>): string {
        const mainArg = Object.entries(args).find(([key]) =>
            !['isNewFile', 'linesAdded', 'linesRemoved', 'oldContent', 'newContent'].includes(key)
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
