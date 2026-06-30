import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

const red = '\x1b[31m\x1b[1m';
const dim = '\x1b[2m';
const reset = '\x1b[0m';

/**
 * Uniform error response helper used by every route.
 *
 * - `error(c, 404)` -> `{ error: 'Not found' }`
 * - `error(c, 400, 'name is required')` -> `{ error: 'name is required' }`
 * - `error(c, 500, err)` -> `{ error: '<message>' }` and logs the cause.
 *
 * Pass `null`/nothing for the cause when the status fully describes the condition
 * (404, 403). Pass a string when client-fixable (400). Pass an Error in the catch (500).
 */
export function error(c: Context, status: ContentfulStatusCode, cause?: unknown): Response {
    let message: string;
    if (cause instanceof Error) {
        message = cause.message || defaultMessage(status);
    } else if (typeof cause === 'string') {
        message = cause;
    } else if (hasMessage(cause)) {
        message = cause.message;
    } else {
        message = defaultMessage(status);
    }

    if (status >= 500) {
        console.error(
            `${red}[error][${status}]${reset} ${message} ${dim}${formatCause(cause)}${reset}`,
        );
    }

    return c.json({ error: message }, status);
}

function hasMessage(cause: unknown): cause is { message: string } {
    return (
        typeof cause === 'object' &&
        cause !== null &&
        'message' in cause &&
        typeof (cause as { message?: unknown }).message === 'string'
    );
}

function formatCause(cause: unknown): string {
    if (cause instanceof Error) return cause.stack || cause.message;
    if (typeof cause === 'string') return cause;
    try {
        return JSON.stringify(cause);
    } catch {
        return String(cause);
    }
}

function defaultMessage(status: number): string {
    if (status === 400) return 'Bad request';
    if (status === 401) return 'Unauthorized';
    if (status === 403) return 'Forbidden';
    if (status === 404) return 'Not found';
    if (status === 409) return 'Conflict';
    if (status === 429) return 'Too many requests';
    return 'Internal server error';
}
