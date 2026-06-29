/**
 * Secret interpolation for strings used by panel http functions: `${NAME}` (or
 * bare `$NAME`) resolves against the secret pool. An unknown reference throws so
 * the function fails loudly rather than calling an API with a broken value.
 * UPPER_SNAKE_CASE names only; single pass (replacement output is not re-scanned).
 */
const SECRET_REF = /\$\{([A-Z][A-Z0-9_]*)\}|\$([A-Z][A-Z0-9_]*)/g;

export function interpolate(input: string, secrets: Record<string, string>): string {
    return input.replace(SECRET_REF, (_m, braced, bare) => {
        const name: string = braced ?? bare;
        if (!(name in secrets)) throw new Error(`Missing secret "${name}"`);
        return secrets[name];
    });
}
