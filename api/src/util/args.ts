import type { MagmaToolCall } from '@pompeii-labs/magma/types';

/**
 * Typed accessors over a tool call's arguments. Replaces the repeated
 * `String(call.fn_args.x ?? '')` / `JSON.parse(String(...))` boilerplate across tools.
 *
 *   const a = new Args(call);
 *   a.text('id');            // trimmed string, '' if absent
 *   a.num('amount', 600);
 *   a.bool('submit');
 *   a.json<Foo[]>('items', []);
 */
export class Args {
    constructor(private readonly call: MagmaToolCall) {}

    /** Raw string value, `fallback` if absent (not trimmed). */
    str(key: string, fallback = ''): string {
        const v = this.call.fn_args[key];
        return v == null ? fallback : String(v);
    }

    /** Trimmed string value, `fallback` if absent. */
    text(key: string, fallback = ''): string {
        return this.str(key, fallback).trim();
    }

    num(key: string, fallback = 0): number {
        const n = Number(this.call.fn_args[key]);
        return Number.isFinite(n) ? n : fallback;
    }

    bool(key: string): boolean {
        return Boolean(this.call.fn_args[key]);
    }

    /** Parse a JSON arg (string or already-decoded value); `fallback` on miss/parse error. */
    json<T>(key: string, fallback: T): T {
        const raw = this.call.fn_args[key];
        if (raw == null) return fallback;
        if (typeof raw !== 'string') return raw as T;
        try {
            return JSON.parse(raw) as T;
        } catch {
            return fallback;
        }
    }
}
