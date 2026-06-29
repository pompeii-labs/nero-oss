import { describe, test, expect, afterEach } from 'bun:test';
import { pushMedium } from '../src/mediums/push';

const realFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = realFetch;
});

interface Seen {
    url: string;
    headers: Record<string, string>;
    body: string;
}
function captureFetch(status = 200): { seen: Seen } {
    const seen: Seen = { url: '', headers: {}, body: '' };
    globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
        seen.url = String(url);
        seen.headers = (init?.headers as Record<string, string>) ?? {};
        seen.body = (init?.body as string) ?? '';
        return Promise.resolve(new Response('ok', { status }));
    }) as typeof fetch;
    return { seen };
}

describe('push medium (ntfy)', () => {
    test('available only when NTFY_TOPIC is set', () => {
        expect(pushMedium.available({})).toBe(false);
        expect(pushMedium.available({ NTFY_TOPIC: 'nero-abc' })).toBe(true);
    });

    test('posts to the topic with title, priority, and body', async () => {
        const { seen } = captureFetch();
        await pushMedium.send(
            { title: 'Build done', body: 'All green.' },
            { NTFY_TOPIC: 'nero-abc' },
        );
        expect(seen.url).toBe('https://ntfy.sh/nero-abc');
        expect(seen.headers.Title).toBe('Build done');
        expect(seen.headers.Priority).toBe('3');
        expect(seen.body).toBe('All green.');
    });

    test('high urgency maps to a higher priority', async () => {
        const { seen } = captureFetch();
        await pushMedium.send(
            { title: 'Deadline', body: 'now', urgency: 'high' },
            { NTFY_TOPIC: 't' },
        );
        expect(seen.headers.Priority).toBe('5');
    });

    test('honors NTFY_SERVER, NTFY_TOKEN, and a click url', async () => {
        const { seen } = captureFetch();
        await pushMedium.send(
            { title: 'x', body: 'y', url: 'https://example.com' },
            { NTFY_TOPIC: 't', NTFY_SERVER: 'https://push.me/', NTFY_TOKEN: 'tok' },
        );
        expect(seen.url).toBe('https://push.me/t');
        expect(seen.headers.Authorization).toBe('Bearer tok');
        expect(seen.headers.Click).toBe('https://example.com');
    });

    test('strips non-ASCII from the title (ntfy header constraint)', async () => {
        const { seen } = captureFetch();
        await pushMedium.send({ title: '🚀 Launch', body: 'go' }, { NTFY_TOPIC: 't' });
        expect(seen.headers.Title).toBe('Launch');
    });

    test('throws on a non-2xx response', async () => {
        captureFetch(500);
        expect(pushMedium.send({ title: 'x', body: 'y' }, { NTFY_TOPIC: 't' })).rejects.toThrow(
            'ntfy 500',
        );
    });
});
