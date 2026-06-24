import { countTokens } from './tokens';

/** Cap a tool result before the model sees it OR it's persisted, so no single
 *  huge result (big diff/file/log) blows the context window. */
const MAX_TOKENS = 2_000;
const MAX_CHARS = MAX_TOKENS * 4;

export function truncateToolResult(result: unknown): string | Record<string, unknown> {
    if (result == null) return '';
    if (typeof result === 'string') return clip(result);
    if (typeof result === 'object') {
        const json = JSON.stringify(result);
        if (countTokens(json) <= MAX_TOKENS) return result as Record<string, unknown>;
        return clip(json);
    }
    return clip(String(result));
}

function clip(text: string): string {
    if (text.length <= MAX_CHARS) return text;
    const head = text.slice(0, MAX_CHARS);
    const dropped = text.length - MAX_CHARS;
    return `${head}\n\n[truncated ${dropped} chars]`;
}
