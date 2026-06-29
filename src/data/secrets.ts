import { getLux, unwrap } from '../lux/client';
import type { Secrets } from '../lux/types';

/** Names + metadata only — never values. Safe to show or hand to the model. */
export interface SecretMeta {
    key: string;
    isPlaceholder: boolean;
    description: string | null;
    updatedAt: number;
}

/** The single-user secret pool. Values are server-side only: this table is NEVER
 *  granted to the anon (browser) role, so secrets stay out of the browser. They
 *  are injected into panel functions at run time (secrets.NAME / ${NAME}). A
 *  placeholder is a secret Nero has staged but the user hasn't filled in yet. */

async function one(key: string): Promise<Secrets | null> {
    const rows = unwrap(
        await getLux().table('secrets').select().eq('key', key).limit(1),
    ) as Secrets[];
    return rows[0] ?? null;
}

/** Set (or replace) a real secret value. Clears any placeholder flag. */
export async function set(key: string, value: string): Promise<void> {
    const existing = await one(key);
    if (existing) {
        unwrap(
            await getLux()
                .table('secrets')
                .update({ value, is_placeholder: false, updated_at: Date.now() } as never)
                .eq('key', key),
        );
    } else {
        unwrap(
            await getLux()
                .table('secrets')
                .insert({ key, value, is_placeholder: false } as never),
        );
    }
}

/** Stage a secret Nero needs but doesn't have, with a note on what it is / where
 *  to get it. No-op if a row already exists. Returns whether it created one. */
export async function stage(key: string, description: string): Promise<'created' | 'exists'> {
    if (await one(key)) return 'exists';
    unwrap(
        await getLux()
            .table('secrets')
            .insert({ key, value: '', is_placeholder: true, description } as never),
    );
    return 'created';
}

/** Decrypted { NAME: value } map for server-side injection. Skips placeholders. */
export async function loadMap(): Promise<Record<string, string>> {
    const rows = unwrap(await getLux().table('secrets').select()) as Secrets[];
    const out: Record<string, string> = {};
    for (const r of rows) {
        if (!r.is_placeholder && r.value) out[r.key] = r.value;
    }
    return out;
}

/** Names + metadata only (never values), for display and for Nero's awareness. */
export async function listMeta(): Promise<SecretMeta[]> {
    const rows = unwrap(await getLux().table('secrets').select()) as Secrets[];
    return rows
        .map((r) => ({
            key: r.key,
            isPlaceholder: !!r.is_placeholder,
            description: r.description ?? null,
            updatedAt: r.updated_at ?? 0,
        }))
        .sort((a, b) => a.key.localeCompare(b.key));
}

export async function remove(key: string): Promise<void> {
    unwrap(await getLux().table('secrets').delete().eq('key', key));
}
