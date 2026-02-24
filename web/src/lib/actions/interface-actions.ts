import { getServerUrl, post } from './helpers';

export function resolveStateRefs(obj: any, state: Record<string, any>): any {
    if (typeof obj === 'string') {
        if (obj.startsWith('$state.')) return state[obj.slice(7)];
        return obj;
    }
    if (Array.isArray(obj)) return obj.map((item) => resolveStateRefs(item, state));
    if (obj && typeof obj === 'object') {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(obj)) out[k] = resolveStateRefs(v, state);
        return out;
    }
    return obj;
}

export function prepareAction(action: any, state: Record<string, any>): any {
    if (action.type !== 'tool' || !action.args) return action;
    let args = action.args;
    if (typeof args === 'string') {
        try {
            args = JSON.parse(args);
        } catch {
            return action;
        }
    }
    return { ...action, args: resolveStateRefs(args, state) };
}

export async function handleAction(
    interfaceId: string,
    action: any,
    state: Record<string, any>,
    onStateUpdate: (key: string, value: any) => void,
    onToast: (message: string, type: 'success' | 'error') => void,
): Promise<{ success: boolean; result?: string }> {
    if (!action) return { success: true };

    if (action.type === 'update') {
        onStateUpdate(action.stateKey, action.value);
        await post(`/api/interfaces/${interfaceId}/action`, action);
        return { success: true };
    }

    if (action.type === 'stream' || action.type === 'kill') {
        const res = await post<{ success: boolean }>(
            `/api/interfaces/${interfaceId}/action`,
            action,
        );
        if (!res.success) {
            let msg = res.error?.message || 'Action failed';
            try {
                const parsed = JSON.parse(msg);
                if (parsed.error) msg = parsed.error;
            } catch {}
            onToast(msg, 'error');
            return { success: false };
        }
        return { success: true };
    }

    const resolved = prepareAction(action, state);
    const res = await post<{ success: boolean; result?: string }>(
        `/api/interfaces/${interfaceId}/action`,
        resolved,
    );

    if (!res.success) {
        let msg = res.error.message || 'Action failed';
        try {
            const parsed = JSON.parse(msg);
            if (parsed.error) msg = parsed.error;
        } catch {}
        onToast(msg, 'error');
        return { success: false };
    }

    if (action.type === 'tool' || action.type === 'command') {
        const resultText = res.data?.result;
        if (action.resultKey && resultText) {
            let parsed = resultText;
            try {
                parsed = JSON.parse(resultText);
            } catch {}
            onStateUpdate(action.resultKey, parsed);
            await post(`/api/interfaces/${interfaceId}/action`, {
                type: 'update',
                stateKey: action.resultKey,
                value: parsed,
            });
        } else if (resultText && typeof resultText === 'string' && resultText.trim()) {
            onToast(
                resultText.length > 200 ? resultText.slice(0, 200) + '...' : resultText,
                'success',
            );
        }
    }

    return { success: true, result: res.data?.result };
}

export type InterfaceSSECallbacks = {
    onUpdate: (patch: any) => void;
    onClose: () => void;
    onStateChange: (key: string, value: any) => void;
};

export function connectInterfaceSSE(
    interfaceId: string,
    callbacks: InterfaceSSECallbacks,
): () => void {
    let eventSource: EventSource | null = null;
    let closed = false;

    function connect() {
        if (closed) return;
        const url = getServerUrl(`/api/interfaces/${interfaceId}/events`);
        eventSource = new EventSource(url);

        eventSource.onmessage = (event) => {
            if (!event.data || event.data === '{}') return;
            try {
                const parsed = JSON.parse(event.data);
                if (parsed.type === 'close') {
                    callbacks.onClose();
                    return;
                }
                if (parsed.type === 'update' && parsed.patch) {
                    callbacks.onUpdate(parsed.patch);
                }
                if (parsed.type === 'state_change') {
                    callbacks.onStateChange(parsed.key, parsed.value);
                }
            } catch {}
        };

        eventSource.onerror = () => {
            eventSource?.close();
            eventSource = null;
            if (!closed) setTimeout(connect, 3000);
        };
    }

    connect();

    return () => {
        closed = true;
        eventSource?.close();
        eventSource = null;
    };
}
