import { encode } from 'gpt-tokenizer';

/**
 * Approximate token count for budgeting (compaction/pruning gates). Uses cl100k
 * via gpt-tokenizer; exact for OpenAI, close enough for Claude via OpenRouter.
 * Falls back to chars/4 if encoding ever throws.
 */
export function countTokens(text: string): number {
    if (!text) return 0;
    try {
        return encode(text).length;
    } catch {
        return Math.ceil(text.length / 4);
    }
}
