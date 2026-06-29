import { spawn, type ChildProcess } from 'child_process';
import { mkdirSync } from 'fs';
import { connectCDP, type CDPClient } from './cdp';

// A real headful-rendered Chrome (headless=new) driven over CDP, with a persistent
// profile so the user's logins stick. One Chrome, one page per session. Note: DRM
// video (Widevine) won't render in a screencast — that's what open_url is for.
const PORT = Number(process.env.NERO_CDP_PORT) || 9322;
const PROFILE = process.env.NERO_BROWSER_PROFILE || `${process.env.HOME}/.nero/browser`;
const CHROME =
    process.env.NERO_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const VIEW_W = 1280;
export const VIEW_H = 800;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let chrome: ChildProcess | null = null;
let browserCdp: CDPClient | null = null;
let booting: Promise<void> | null = null;

async function chromeUp(): Promise<{ webSocketDebuggerUrl: string } | null> {
    try {
        const r = await fetch(`http://localhost:${PORT}/json/version`);
        return r.ok ? ((await r.json()) as { webSocketDebuggerUrl: string }) : null;
    } catch {
        return null;
    }
}

async function ensureChrome(): Promise<CDPClient> {
    if (browserCdp && !browserCdp.closed) return browserCdp;
    if (booting) {
        await booting;
        return browserCdp!;
    }
    booting = (async () => {
        let info = await chromeUp();
        if (!info) {
            mkdirSync(PROFILE, { recursive: true });
            chrome = spawn(
                CHROME,
                [
                    '--headless=new',
                    `--remote-debugging-port=${PORT}`,
                    `--user-data-dir=${PROFILE}`,
                    '--no-first-run',
                    '--no-default-browser-check',
                    '--hide-scrollbars',
                    `--window-size=${VIEW_W},${VIEW_H}`,
                    'about:blank',
                ],
                { stdio: 'ignore' },
            );
            for (let i = 0; i < 50 && !info; i++) {
                await sleep(150);
                info = await chromeUp();
            }
        }
        if (!info) throw new Error('Chrome failed to start for CDP');
        browserCdp = await connectCDP(info.webSocketDebuggerUrl);
    })();
    try {
        await booting;
    } finally {
        booting = null;
    }
    return browserCdp!;
}

export interface BrowserSession {
    id: string;
    targetId: string;
    cdp: CDPClient;
    navigate(url: string): Promise<void>;
    currentUrl(): Promise<string>;
    attachViewer(onFrame: (jpegB64: string) => void): Promise<void>;
    detachViewer(): Promise<void>;
    // raw input (user-driven, from the panel)
    click(x: number, y: number): Promise<void>;
    scroll(x: number, y: number, dy: number): Promise<void>;
    typeText(text: string): Promise<void>;
    pressKey(key: 'Enter' | 'Backspace' | 'Tab'): Promise<void>;
    // agentic (Nero-driven, by element ref from a snapshot)
    snapshot(): Promise<PageSnapshot>;
    clickRef(ref: number): Promise<void>;
    typeRef(ref: number, text: string): Promise<void>;
    /** Type a value Nero never sees (resolved from the secret pool server-side). */
    fillSecret(ref: number, value: string): Promise<void>;
    goBack(): Promise<void>;
    close(): Promise<void>;
}

const KEYS: Record<string, { code: string; key: string; windowsVirtualKeyCode: number }> = {
    Enter: { code: 'Enter', key: 'Enter', windowsVirtualKeyCode: 13 },
    Backspace: { code: 'Backspace', key: 'Backspace', windowsVirtualKeyCode: 8 },
    Tab: { code: 'Tab', key: 'Tab', windowsVirtualKeyCode: 9 },
};

export interface SnapElement {
    ref: number;
    role: string;
    name: string;
    typeable: boolean;
    x: number;
    y: number;
}
export interface PageSnapshot {
    title: string;
    url: string;
    count: number;
    elements: SnapElement[];
    text: string;
}

// Injected DOM walk: finds visible interactive elements (incl. shadow DOM), tags
// each with a re-locatable data-nero-ref, and returns a compact, indexed list with
// coords + the page's text. Password field VALUES are never included (secret safety).
const SNAPSHOT_JS = `(() => {
  const out = []; let i = 0; const seen = new Set();
  const vis = (el) => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const cs = getComputedStyle(el); if (cs.visibility==='hidden'||cs.display==='none'||+cs.opacity===0) return false; if (r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth) return false; return true; };
  const inter = (el) => { const t = el.tagName.toLowerCase(); if (['a','button','input','textarea','select'].includes(t)) return true; const role = el.getAttribute('role'); if (role && ['button','link','textbox','searchbox','checkbox','radio','combobox','menuitem','menuitemcheckbox','tab','switch','option'].includes(role)) return true; if (el.hasAttribute('onclick')) return true; const ti = el.getAttribute('tabindex'); if (ti && ti !== '-1') return true; if (el.isContentEditable) return true; if (getComputedStyle(el).cursor === 'pointer' && (el.onclick || el.getAttribute('jsaction'))) return true; return false; };
  const lbl = (el) => { let v = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('alt') || el.getAttribute('title') || (el.value && el.type !== 'password' ? el.value : '') || el.innerText || el.getAttribute('name') || ''; return String(v).replace(/\\s+/g,' ').trim().slice(0,140); };
  const typ = (el) => { const t = el.tagName.toLowerCase(); if (t==='textarea') return true; if (t==='input') return !['button','submit','checkbox','radio','range','file','image','reset','color'].includes((el.type||'text').toLowerCase()); if (el.isContentEditable) return true; const role = el.getAttribute('role'); return role==='textbox'||role==='searchbox'; };
  const walk = (root) => { let els; try { els = root.querySelectorAll('*'); } catch(e){ return; } for (const el of els) { if (inter(el) && vis(el) && !seen.has(el)) { seen.add(el); const r = el.getBoundingClientRect(); el.setAttribute('data-nero-ref', String(i)); out.push({ ref: i, role: el.getAttribute('role') || el.tagName.toLowerCase(), name: lbl(el), typeable: typ(el), x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) }); i++; } if (el.shadowRoot) walk(el.shadowRoot); } };
  walk(document);
  return { title: document.title, url: location.href, count: out.length, elements: out.slice(0, 200), text: (document.body ? document.body.innerText : '').replace(/\\n{3,}/g,'\\n\\n').slice(0, 2500) };
})()`;

const coordsJs = (ref: number) =>
    `(() => { const e = document.querySelector('[data-nero-ref="${ref}"]'); if(!e) return null; e.scrollIntoView({block:'center',inline:'center'}); const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) }; })()`;
const focusJs = (ref: number) =>
    `(() => { const e = document.querySelector('[data-nero-ref="${ref}"]'); if(!e) return false; e.focus(); if (e.select) try { e.select(); } catch(x){} return true; })()`;

const sessions = new Map<string, BrowserSession>();

export function getSession(id: string): BrowserSession | undefined {
    return sessions.get(id);
}

export function listSessions(): BrowserSession[] {
    return [...sessions.values()];
}

export async function createSession(url: string): Promise<BrowserSession> {
    const browser = await ensureChrome();
    const { targetId } = (await browser.send('Target.createTarget', {
        url: url || 'about:blank',
    })) as { targetId: string };

    const cdp = await connectCDP(`ws://localhost:${PORT}/devtools/page/${targetId}`);
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: VIEW_W,
        height: VIEW_H,
        deviceScaleFactor: 1,
        mobile: false,
    });

    const id = `br-${crypto.randomUUID().slice(0, 8)}`;
    let viewing = false;

    const session: BrowserSession = {
        id,
        targetId,
        cdp,
        async navigate(u) {
            await cdp.send('Page.navigate', { url: u });
        },
        async currentUrl() {
            const r = (await cdp.send('Target.getTargetInfo', { targetId })) as {
                targetInfo: { url: string };
            };
            return r.targetInfo?.url ?? '';
        },
        async attachViewer(onFrame) {
            cdp.on('Page.screencastFrame', (p: { data: string; sessionId: number }) => {
                onFrame(p.data);
                void cdp.send('Page.screencastFrameAck', { sessionId: p.sessionId });
            });
            viewing = true;
            await cdp.send('Page.startScreencast', {
                format: 'jpeg',
                quality: 65,
                maxWidth: VIEW_W,
                maxHeight: VIEW_H,
                everyNthFrame: 1,
            });
        },
        async detachViewer() {
            if (viewing) {
                viewing = false;
                await cdp.send('Page.stopScreencast').catch(() => {});
            }
        },
        async click(x, y) {
            const base = { x, y, button: 'left', clickCount: 1 };
            await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
            await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
        },
        async scroll(x, y, dy) {
            await cdp.send('Input.dispatchMouseEvent', {
                type: 'mouseWheel',
                x,
                y,
                deltaX: 0,
                deltaY: dy,
            });
        },
        async typeText(text) {
            await cdp.send('Input.insertText', { text });
        },
        async pressKey(key) {
            const k = KEYS[key];
            if (!k) return;
            await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...k });
            await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...k });
        },
        async snapshot() {
            const r = (await cdp.send('Runtime.evaluate', {
                expression: SNAPSHOT_JS,
                returnByValue: true,
                awaitPromise: true,
            })) as { result?: { value?: PageSnapshot } };
            return r.result?.value ?? { title: '', url: '', count: 0, elements: [], text: '' };
        },
        async clickRef(ref) {
            const r = (await cdp.send('Runtime.evaluate', {
                expression: coordsJs(ref),
                returnByValue: true,
            })) as { result?: { value?: { x: number; y: number } | null } };
            const c = r.result?.value;
            if (!c) throw new Error(`element ${ref} not found (re-snapshot and retry)`);
            await sleep(60); // let scrollIntoView settle
            await this.click(c.x, c.y);
        },
        async typeRef(ref, text) {
            const ok = (await cdp.send('Runtime.evaluate', {
                expression: focusJs(ref),
                returnByValue: true,
            })) as { result?: { value?: boolean } };
            if (!ok.result?.value) throw new Error(`element ${ref} not found`);
            await cdp.send('Input.insertText', { text });
        },
        async fillSecret(ref, value) {
            const ok = (await cdp.send('Runtime.evaluate', {
                expression: focusJs(ref),
                returnByValue: true,
            })) as { result?: { value?: boolean } };
            if (!ok.result?.value) throw new Error(`element ${ref} not found`);
            // The value came from the secret pool and is never returned anywhere.
            await cdp.send('Input.insertText', { text: value });
        },
        async goBack() {
            await cdp.send('Runtime.evaluate', { expression: 'history.back()' });
        },
        async close() {
            sessions.delete(id);
            await this.detachViewer().catch(() => {});
            cdp.close();
            await browser.send('Target.closeTarget', { targetId }).catch(() => {});
        },
    };
    sessions.set(id, session);
    return session;
}

/** Test/shutdown hook. */
export async function closeAll(): Promise<void> {
    for (const s of [...sessions.values()]) await s.close().catch(() => {});
    browserCdp?.close();
    browserCdp = null;
    chrome?.kill();
    chrome = null;
}
