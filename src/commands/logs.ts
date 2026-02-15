import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { NeroClient } from '../client/index.js';

function getServiceUrl(): string {
    return process.env.NERO_SERVICE_URL || 'http://localhost:4847';
}

function formatLevel(level: string): string {
    switch (level) {
        case 'DEBUG':
            return chalk.gray(level);
        case 'INFO':
            return chalk.cyan(level);
        case 'WARN':
            return chalk.yellow(level);
        case 'ERROR':
            return chalk.red(level);
        case 'TOOL':
            return chalk.white(level);
        default:
            return chalk.dim(level);
    }
}

function formatEntry(entry: { timestamp: string; level: string; source: string; message: string }) {
    const time = new Date(entry.timestamp).toLocaleTimeString();
    const level = formatLevel(entry.level);
    return `${chalk.dim(time)} [${chalk.bold(entry.source)}][${level}] ${entry.message}`;
}

export function registerLogsCommand(program: Command) {
    const logs = program
        .command('logs')
        .description('View service logs')
        .option('-n, --lines <number>', 'Number of lines to show', '50')
        .option('-l, --level <level>', 'Filter by level (DEBUG, INFO, WARN, ERROR)')
        .option('-f, --follow', 'Stream logs in real-time')
        .action(async (opts) => {
            const serviceUrl = getServiceUrl();
            const running = await NeroClient.checkServiceRunning(serviceUrl);
            if (!running) {
                console.error(chalk.red('Nero service is not running. Start it with: nero start'));
                process.exit(1);
            }

            const config = await loadConfig();
            const headers: Record<string, string> = {};
            if (config.licenseKey) headers['x-license-key'] = config.licenseKey;

            if (opts.follow) {
                await streamLogs(serviceUrl, headers, opts.level);
            } else {
                await fetchLogs(serviceUrl, headers, parseInt(opts.lines, 10), opts.level);
            }
        });
}

async function fetchLogs(
    serviceUrl: string,
    headers: Record<string, string>,
    lines: number,
    level?: string,
) {
    const params = new URLSearchParams();
    params.append('lines', String(lines));
    if (level) params.append('level', level);

    try {
        const response = await fetch(`${serviceUrl}/api/logs?${params}`, { headers });
        if (!response.ok) {
            console.error(chalk.red(`Failed to fetch logs: ${response.status}`));
            process.exit(1);
        }

        const data = await response.json();
        if (data.entries.length === 0) {
            console.log(chalk.dim('No logs found.'));
            return;
        }

        for (const entry of data.entries) {
            console.log(formatEntry(entry));
        }

        if (data.logFile) {
            console.log(chalk.dim(`\nLog file: ${data.logFile}`));
        }
    } catch (error) {
        console.error(chalk.red(`Failed to fetch logs: ${(error as Error).message}`));
        process.exit(1);
    }
}

async function streamLogs(serviceUrl: string, headers: Record<string, string>, level?: string) {
    const params = new URLSearchParams();
    if (level) params.append('level', level);

    console.log(chalk.dim('Streaming logs (Ctrl+C to stop)...\n'));

    try {
        const response = await fetch(`${serviceUrl}/api/logs/stream?${params}`, { headers });
        if (!response.ok) {
            console.error(chalk.red(`Failed to stream logs: ${response.status}`));
            process.exit(1);
        }

        const reader = response.body?.getReader();
        if (!reader) {
            console.error(chalk.red('No response body'));
            process.exit(1);
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6);
                if (data === '{}') continue;

                try {
                    const entry = JSON.parse(data);
                    if (entry.timestamp) {
                        console.log(formatEntry(entry));
                    }
                } catch {}
            }
        }
    } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        console.error(chalk.red(`Stream error: ${(error as Error).message}`));
        process.exit(1);
    }
}
