/* eslint-disable @typescript-eslint/no-explicit-any */
/** A tiny Chrome DevTools Protocol client over a target's WebSocket. Send commands
 *  (id-correlated), subscribe to events. Enough to drive a page + screencast. */
export interface CDPClient {
    send(method: string, params?: Record<string, unknown>): Promise<any>;
    on(method: string, handler: (params: any) => void): void;
    close(): void;
    readonly closed: boolean;
}

export function connectCDP(wsUrl: string): Promise<CDPClient> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        let nextId = 0;
        let closed = false;
        const pending = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>();
        const handlers = new Map<string, ((p: any) => void)[]>();

        ws.onopen = () => resolve(client);
        ws.onerror = () => reject(new Error('CDP socket error'));
        ws.onclose = () => {
            closed = true;
            for (const p of pending.values()) p.rej(new Error('CDP closed'));
            pending.clear();
        };
        ws.onmessage = (ev) => {
            const m = JSON.parse(ev.data as string);
            if (m.id && pending.has(m.id)) {
                const p = pending.get(m.id)!;
                pending.delete(m.id);
                if (m.error) p.rej(new Error(m.error.message));
                else p.res(m.result);
            } else if (m.method) {
                for (const h of handlers.get(m.method) ?? []) h(m.params);
            }
        };

        const client: CDPClient = {
            get closed() {
                return closed;
            },
            send: (method, params = {}) =>
                new Promise((res, rej) => {
                    if (closed) return rej(new Error('CDP closed'));
                    const id = ++nextId;
                    pending.set(id, { res, rej });
                    ws.send(JSON.stringify({ id, method, params }));
                }),
            on: (method, handler) => {
                const arr = handlers.get(method) ?? [];
                arr.push(handler);
                handlers.set(method, arr);
            },
            close: () => ws.close(),
        };
    });
}
