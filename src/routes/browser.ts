import { Hono } from 'hono';
import type { UpgradeWebSocket } from 'hono/ws';
import { getSession, VIEW_W, VIEW_H } from '../services/browser/session';
import type { BrowserSession } from '../services/browser/session';

/** Streams a browser session's screencast to a Field panel and relays the user's
 *  mouse/keyboard back into the real page. One socket per open browser panel. */
export function browserRoutes(upgradeWebSocket: UpgradeWebSocket): Hono {
    const app = new Hono();

    app.get(
        '/v1/browser',
        upgradeWebSocket((c) => {
            const sessionId = c.req.query('session') ?? '';
            let session: BrowserSession | undefined;
            return {
                onOpen(_evt, ws) {
                    session = getSession(sessionId);
                    if (!session) {
                        ws.send(JSON.stringify({ type: 'gone' }));
                        return;
                    }
                    ws.send(JSON.stringify({ type: 'meta', w: VIEW_W, h: VIEW_H }));
                    void session.attachViewer((data) =>
                        ws.send(JSON.stringify({ type: 'frame', data })),
                    );
                },
                onMessage(evt, _ws) {
                    if (!session) return;
                    let m: {
                        type?: string;
                        x?: number;
                        y?: number;
                        dy?: number;
                        text?: string;
                        key?: 'Enter' | 'Backspace' | 'Tab';
                        url?: string;
                    };
                    try {
                        m = JSON.parse(String(evt.data));
                    } catch {
                        return;
                    }
                    switch (m.type) {
                        case 'click':
                            void session.click(m.x ?? 0, m.y ?? 0);
                            break;
                        case 'scroll':
                            void session.scroll(m.x ?? 0, m.y ?? 0, m.dy ?? 0);
                            break;
                        case 'type':
                            if (m.text) void session.typeText(m.text);
                            break;
                        case 'key':
                            if (m.key) void session.pressKey(m.key);
                            break;
                        case 'nav':
                            if (m.url) void session.navigate(m.url);
                            break;
                    }
                },
                onClose() {
                    void session?.detachViewer();
                },
            };
        }),
    );

    return app;
}
