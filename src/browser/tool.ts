import { tool, toolparam } from '@pompeii-labs/magma/decorators';
import type { MagmaToolCall } from '@pompeii-labs/magma/types';
import type { MagmaAgent } from '@pompeii-labs/magma';
import { runShell } from '../tools/shell';
import { createSession } from './session';
import { Panel } from '../models/panel';
import { Presence } from '../models/presence';
import { Device } from '../models/device';

/** Nero opening things in the user's REAL browser, where their logins and DRM work
 *  (streaming, paywalled sites). Fire-and-forget; for actually watching/using a
 *  site that can't be embedded. For showing/operating the web inside the Field,
 *  that's the streamed browser panel, not this. */
export class BrowserOpenUtility {
    @tool({
        name: 'open_url',
        description:
            "Open a URL in the user's own browser (fire-and-forget). Use when they want to actually WATCH or use something that can't be embedded — streaming (Hulu, Netflix, YouTube fullscreen), logged-in or paywalled sites, or anything DRM. Be precise: open the DIRECT url for the specific thing (the exact episode, article, PR, doc), never just a homepage. If you don't know the direct url, search for it first, then open it.",
    })
    @toolparam({
        key: 'url',
        type: 'string',
        required: true,
        description: 'The full https URL to open — the specific page/episode, not a homepage.',
    })
    async open_url(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const url = String(call.fn_args.url ?? '').trim();
        if (!/^https?:\/\//i.test(url)) return 'Provide a full http(s) URL.';

        const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
        // Single-quote the URL so the shell treats it literally (URLs can hold & ? #).
        const safe = `'${url.replace(/'/g, "'\\''")}'`;
        const { code, stderr } = await runShell(`${opener} ${safe}`, { timeoutMs: 5000 });
        if (code !== 0) return `Couldn't open it: ${stderr || `exit ${code}`}`;
        return `Opened ${url} in your browser.`;
    }

    @tool({
        name: 'open_browser',
        description:
            'Open a live, interactive web page inside a panel on the Field — a real browser you (and the user) can see and click. Use to SHOW or operate the web: a dashboard, docs, a site, search results, a logged-in page. The user can click/scroll/type in it. Open the DIRECT url for what they want. NOTE: DRM video (Hulu/Netflix) will not play here (blank) — for actually watching, use open_url instead.',
    })
    @toolparam({
        key: 'url',
        type: 'string',
        required: true,
        description: 'The full https URL to load — the specific page, not a homepage.',
    })
    @toolparam({
        key: 'title',
        type: 'string',
        required: false,
        description: 'Panel title (defaults to "Browser").',
    })
    async open_browser(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const url = String(call.fn_args.url ?? '').trim();
        if (!/^https?:\/\//i.test(url)) return 'Provide a full http(s) URL.';

        const here = await Presence.get();
        const online = await Device.listOnline();
        const deviceId = here && online.some((d) => d.id === here) ? here : online[0]?.id;
        if (!deviceId) return 'No screen is online to show the browser on.';

        const session = await createSession(url);
        await Panel.open({
            device_id: deviceId,
            title: String(call.fn_args.title ?? 'Browser'),
            components: [{ type: 'browser', session: session.id, url }],
            x: 80,
            y: 80,
            w: 980,
            h: 660,
        });
        // Let the page load, then hand back the session id so you can drive it with
        // read_page / browser_click / browser_type / browser_fill_secret.
        await new Promise((r) => setTimeout(r, 1300));
        const snap = await session.snapshot();
        return `Opened ${url} (browser session ${session.id}). The user can interact with it, and so can you: read_page/browser_* with this session id.\n\nPAGE: ${snap.title} — ${snap.url}\n${snap.count} interactive elements ready. Call read_page to see them.`;
    }
}
