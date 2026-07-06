import { createClient, type LuxProjectClient } from '@luxdb/sdk';
import type { Database } from './types';
import { loadConfig } from './config';

let client: LuxProjectClient<Database> | null = null;

/** Server-side Lux client (secret key). Singleton over the project's tables. */
export function getLux(): LuxProjectClient<Database> {
    if (client) return client;
    const { lux } = loadConfig();
    if (!lux.url || !lux.secretKey) {
        throw new Error('Lux not configured: set LUX_URL and LUX_SECRET_KEY (run `lux start`).');
    }
    client = createClient<Database>(lux.url, lux.secretKey);
    return client;
}

export function isLuxConnected(): boolean {
    const { lux } = loadConfig();
    return Boolean(lux.url && lux.secretKey);
}

/** Grant the anonymous (browser) principal read access to the tables the web
 *  subscribes to via `.live()`. Idempotent; run on startup. Writes stay
 *  secret-key only (server-side). */
export async function ensureAnonGrants(): Promise<void> {
    const lux = getLux();
    for (const table of [
        'messages',
        'dispatches',
        'devices',
        'presence',
        'panels',
        'questions',
        'settings',
        'projects',
        'project_tasks',
    ]) {
        const res = await lux.exec(`GRANT read ON ${table} TO anon`);
        if (res.error) console.error(`[lux] grant on ${table} failed:`, res.error);
    }
}

/** Unwrap a Lux `{ data, error }` result, throwing on error. */
export function unwrap<T>(res: { data?: T; error?: unknown }): T {
    if (res.error) {
        const msg =
            typeof res.error === 'object' && res.error && 'message' in res.error
                ? String((res.error as { message: unknown }).message)
                : JSON.stringify(res.error);
        throw new Error(`Lux error: ${msg}`);
    }
    return res.data as T;
}

/** Test hook: drop the memoized client. */
export function __resetLux(): void {
    client = null;
}
