import { describe, expect, it } from 'bun:test';
import { chunkOnWhitespace } from '../src/services/voice/tts';

describe('chunkOnWhitespace', () => {
    it('holds a partial word until a boundary forms', () => {
        expect(chunkOnWhitespace('Hel')).toEqual({ send: null, rest: 'Hel' });
    });

    it('sends complete words and keeps the trailing partial', () => {
        expect(chunkOnWhitespace('Hello there, wor')).toEqual({
            send: 'Hello there, ',
            rest: 'wor',
        });
    });

    it('keeps the trailing space on the sent prefix (no word gluing)', () => {
        const { send } = chunkOnWhitespace('one two ');
        expect(send).toBe('one two ');
    });

    it('treats newlines as boundaries', () => {
        expect(chunkOnWhitespace('line one\ntwo')).toEqual({ send: 'line one\n', rest: 'two' });
    });

    it('accumulates across calls like the streaming feed does', () => {
        // Simulate token-by-token: feed "Hey", " ", "Nero." and track what flushes.
        let buf = '';
        const sent: string[] = [];
        for (const tok of ['Hey', ' ', 'Nero.']) {
            buf += tok;
            const { send, rest } = chunkOnWhitespace(buf);
            if (send) {
                sent.push(send);
                buf = rest;
            }
        }
        expect(sent).toEqual(['Hey ']);
        expect(buf).toBe('Nero.'); // tail flushed by endTurn()
    });
});
