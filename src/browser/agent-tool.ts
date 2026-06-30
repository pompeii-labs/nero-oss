import { tool, toolparam } from '@pompeii-labs/magma/decorators';
import type { MagmaToolCall } from '@pompeii-labs/magma/types';
import type { MagmaAgent } from '@pompeii-labs/magma';
import { getSession, listSessions, type BrowserSession, type PageSnapshot } from './session';
import { Secret } from '../models/secret';

function resolve(idArg: unknown): BrowserSession | string {
    const id = String(idArg ?? '').trim();
    if (id) return getSession(id) ?? `No browser session "${id}". Open one with open_browser.`;
    const all = listSessions();
    if (all.length === 1) return all[0];
    if (all.length === 0) return 'No browser is open. Use open_browser first.';
    return `Multiple browsers open — pass session. Open: ${all.map((s) => s.id).join(', ')}.`;
}

function fmt(s: PageSnapshot): string {
    const shown = s.elements.slice(0, 80);
    const lines = shown.map(
        (e) => `[${e.ref}] ${e.role}${e.typeable ? '(input)' : ''} ${JSON.stringify(e.name)}`,
    );
    const more = s.count > shown.length ? `\n…(${s.count} interactive elements total)` : '';
    return `PAGE: ${s.title || '(untitled)'} — ${s.url}\nELEMENTS (act by ref number):\n${lines.join('\n')}${more}\n\nTEXT:\n${s.text}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Nero driving a live browser panel himself: read the page as an indexed element
 *  list, then act by ref. Every action returns a FRESH snapshot (refs change on any
 *  DOM change, so always act on the latest list). Secrets fill server-side and never
 *  pass through here. */
export class BrowserAgentUtility {
    @tool({
        name: 'read_page',
        description:
            'Read the current page of an open browser panel as a numbered list of interactive elements (links, buttons, inputs) plus the page text. Call this before acting, and note that refs are only valid for THIS snapshot — they change after any click/navigation, so re-read.',
    })
    @toolparam({
        key: 'session',
        type: 'string',
        required: false,
        description: 'Browser session id (optional if only one is open).',
    })
    async read_page(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const s = resolve(call.fn_args.session);
        if (typeof s === 'string') return s;
        return fmt(await s.snapshot());
    }

    @tool({
        name: 'browser_navigate',
        description: 'Navigate an open browser panel to a URL. Returns the new page snapshot.',
    })
    @toolparam({ key: 'url', type: 'string', required: true, description: 'Full https URL.' })
    @toolparam({ key: 'session', type: 'string', required: false })
    async browser_navigate(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const s = resolve(call.fn_args.session);
        if (typeof s === 'string') return s;
        const url = String(call.fn_args.url ?? '').trim();
        if (!/^https?:\/\//i.test(url)) return 'Provide a full http(s) URL.';
        await s.navigate(url);
        await sleep(1200);
        return fmt(await s.snapshot());
    }

    @tool({
        name: 'browser_click',
        description:
            'Click an element by its ref from the latest read_page. Returns the new snapshot.',
    })
    @toolparam({ key: 'ref', type: 'number', required: true, description: 'Element ref number.' })
    @toolparam({ key: 'session', type: 'string', required: false })
    async browser_click(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const s = resolve(call.fn_args.session);
        if (typeof s === 'string') return s;
        try {
            await s.clickRef(Number(call.fn_args.ref));
        } catch (e) {
            return e instanceof Error ? e.message : String(e);
        }
        await sleep(700);
        return fmt(await s.snapshot());
    }

    @tool({
        name: 'browser_type',
        description:
            'Type text into an input element by ref (from the latest read_page). For passwords or any credential, DO NOT use this — use browser_fill_secret. Returns the new snapshot.',
    })
    @toolparam({ key: 'ref', type: 'number', required: true })
    @toolparam({
        key: 'text',
        type: 'string',
        required: true,
        description: 'Plain (non-secret) text to type.',
    })
    @toolparam({
        key: 'submit',
        type: 'boolean',
        required: false,
        description: 'Press Enter after typing.',
    })
    @toolparam({ key: 'session', type: 'string', required: false })
    async browser_type(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const s = resolve(call.fn_args.session);
        if (typeof s === 'string') return s;
        try {
            await s.typeRef(Number(call.fn_args.ref), String(call.fn_args.text ?? ''));
            if (call.fn_args.submit) await s.pressKey('Enter');
        } catch (e) {
            return e instanceof Error ? e.message : String(e);
        }
        await sleep(call.fn_args.submit ? 1200 : 300);
        return fmt(await s.snapshot());
    }

    @tool({
        name: 'browser_fill_secret',
        description:
            "Fill a field with a stored secret WITHOUT ever seeing its value. Give the field ref and the secret's name (e.g. HULU_PASSWORD); the server types the real value into the page. Use this for every password/credential. If the secret isn't set, you'll be told to request it. Returns the new snapshot.",
    })
    @toolparam({ key: 'ref', type: 'number', required: true, description: 'The input field ref.' })
    @toolparam({
        key: 'secret',
        type: 'string',
        required: true,
        description: 'Secret NAME (not value), e.g. HULU_PASSWORD.',
    })
    @toolparam({
        key: 'submit',
        type: 'boolean',
        required: false,
        description: 'Press Enter after filling.',
    })
    @toolparam({ key: 'session', type: 'string', required: false })
    async browser_fill_secret(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const s = resolve(call.fn_args.session);
        if (typeof s === 'string') return s;
        const name = String(call.fn_args.secret ?? '')
            .trim()
            .toUpperCase();
        const value = (await Secret.loadMap())[name];
        if (!value)
            return `Secret "${name}" isn't set. Stage it with request_secret and ask the user to fill it.`;
        try {
            await s.fillSecret(Number(call.fn_args.ref), value);
            if (call.fn_args.submit) await s.pressKey('Enter');
        } catch (e) {
            return e instanceof Error ? e.message : String(e);
        }
        await sleep(call.fn_args.submit ? 1500 : 300);
        return `Filled the field with ${name} (value never exposed).\n\n${fmt(await s.snapshot())}`;
    }

    @tool({
        name: 'browser_scroll',
        description: 'Scroll the page down (positive) or up (negative). Returns the new snapshot.',
    })
    @toolparam({
        key: 'amount',
        type: 'number',
        required: false,
        description: 'Pixels; default 600.',
    })
    @toolparam({ key: 'session', type: 'string', required: false })
    async browser_scroll(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const s = resolve(call.fn_args.session);
        if (typeof s === 'string') return s;
        const amt = call.fn_args.amount != null ? Number(call.fn_args.amount) : 600;
        await s.scroll(640, 400, amt);
        await sleep(400);
        return fmt(await s.snapshot());
    }
}
