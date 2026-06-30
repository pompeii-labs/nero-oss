import type { Medium } from './types';

// ntfy.sh: dead-simple pub/sub push. The user picks a topic, subscribes in the
// ntfy app, and sets NTFY_TOPIC. We POST the message there; their phone buzzes.
// Self-hostable via NTFY_SERVER; private topics via NTFY_TOKEN.
const PRIORITY: Record<string, string> = { low: '2', normal: '3', high: '5' };

// ntfy header values must be ASCII (latin-1). Strip anything else from the title.
const ascii = (s: string) => s.replace(/[^\x20-\x7E]/g, '').trim() || 'Nero';

export const pushMedium: Medium = {
    name: 'push',
    displayName: 'Push (ntfy)',
    available: (s) => Boolean(s.NTFY_TOPIC),
    async send(n, s) {
        const server = (s.NTFY_SERVER || 'https://ntfy.sh').replace(/\/+$/, '');
        const headers: Record<string, string> = {
            Title: ascii(n.title),
            Priority: PRIORITY[n.urgency ?? 'normal'] ?? '3',
        };
        if (n.url) headers.Click = n.url;
        if (s.NTFY_TOKEN) headers.Authorization = `Bearer ${s.NTFY_TOKEN}`;
        const res = await fetch(`${server}/${encodeURIComponent(s.NTFY_TOPIC)}`, {
            method: 'POST',
            headers,
            body: n.body,
        });
        if (!res.ok) throw new Error(`ntfy ${res.status}: ${(await res.text()).slice(0, 120)}`);
    },
};
