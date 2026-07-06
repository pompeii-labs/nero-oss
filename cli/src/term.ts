/** Tiny ANSI helpers. No dependency - the CLI stays lean. */
const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const wrap = (code: string) => (s: string | number) =>
    useColor ? `\x1b[${code}m${s}\x1b[0m` : `${s}`;

export const c = {
    bold: wrap('1'),
    dim: wrap('2'),
    red: wrap('31'),
    green: wrap('32'),
    yellow: wrap('33'),
    blue: wrap('34'),
    cyan: wrap('36'),
    gray: wrap('90'),
};

export const ok = (m: string) => console.log(`${c.green('✓')} ${m}`);
export const warn = (m: string) => console.log(`${c.yellow('!')} ${m}`);
export const fail = (m: string) => console.error(`${c.red('✗')} ${m}`);
export const info = (m: string) => console.log(`${c.cyan('›')} ${m}`);
export const line = (m = '') => console.log(m);

/** Two-column key/value, dim key. */
export const kv = (k: string, v: string) => console.log(`  ${c.dim(k.padEnd(18))} ${v}`);

/** Exit with a red error message. */
export function die(msg: string): never {
    fail(msg);
    process.exit(1);
}
