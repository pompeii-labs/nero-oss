const blue = '\x1b[34m\x1b[1m';
const yellow = '\x1b[33m\x1b[1m';
const red = '\x1b[31m\x1b[1m';
const dim = '\x1b[2m';
const reset = '\x1b[0m';

/** One tagged logger per module: `const log = new Logger('projects')`. Info for
 *  lifecycle, warn for recoverable anomalies, error for unexpected failures. Never
 *  log secrets or full request bodies. Replaces ad-hoc console.log. */
export class Logger {
    constructor(private readonly tag: string) {}

    info(message: string, meta?: Record<string, unknown>): void {
        this.write(blue, 'info', message, meta);
    }

    warn(message: string, meta?: Record<string, unknown>): void {
        this.write(yellow, 'warn', message, meta);
    }

    error(message: string, meta?: Record<string, unknown>): void {
        this.write(red, 'error', message, meta);
    }

    private write(color: string, level: string, message: string, meta?: Record<string, unknown>) {
        const head = `${color}[${this.tag}]${reset} ${level} ${message}`;
        if (meta && Object.keys(meta).length > 0) {
            console.log(`${head} ${dim}${JSON.stringify(meta)}${reset}`);
        } else {
            console.log(head);
        }
    }
}
