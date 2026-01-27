import chalk from 'chalk';

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
}
