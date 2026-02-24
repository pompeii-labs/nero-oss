import { getServerUrl, get } from '$lib/actions/helpers';

export type NeroInterface = {
    id: string;
    title: string;
    width: number;
    height: number;
    accentColor?: string;
    components: any[];
    state?: Record<string, any>;
    targetDevice?: string;
};

function createInterfacesStore() {
    let openInterfaces = $state<Map<string, NeroInterface>>(new Map());
    let globalEventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let deviceId: string | null = null;
    let deviceName: string | null = null;
    let onVoiceMigrate: ((targetDevice: string) => void) | null = null;
    let onPresence: ((display: string) => void) | null = null;

    function openInterface(schema: NeroInterface) {
        if (openInterfaces.has(schema.id)) return;
        openInterfaces = new Map([...openInterfaces, [schema.id, schema]]);
    }

    function closeInterface(id: string) {
        const next = new Map(openInterfaces);
        next.delete(id);
        openInterfaces = next;
    }

    function closeAll() {
        openInterfaces = new Map();
    }

    function connectGlobalEvents(device?: string, name?: string) {
        if (globalEventSource) return;

        deviceId = device || null;
        deviceName = name || null;

        let sseUrl = '/api/interfaces/events';
        const params = new URLSearchParams();
        if (device) params.set('device', device);
        if (name) params.set('name', name);
        if (params.toString()) sseUrl += `?${params.toString()}`;

        const url = getServerUrl(sseUrl);
        globalEventSource = new EventSource(url);

        globalEventSource.onmessage = (event) => {
            if (!event.data || event.data === '{}') return;
            try {
                const parsed = JSON.parse(event.data);
                if (parsed.type === 'opened' && parsed.iface) {
                    openInterface(parsed.iface);
                } else if (parsed.type === 'closed' && parsed.id) {
                    closeInterface(parsed.id);
                } else if (parsed.type === 'voice_migrate' && parsed.targetDevice) {
                    onVoiceMigrate?.(parsed.targetDevice);
                } else if (parsed.type === 'presence' && parsed.display) {
                    onPresence?.(parsed.display);
                } else if (parsed.type === 'moved') {
                    const isSource =
                        parsed.fromDevice === deviceName || parsed.fromDevice === deviceId;
                    const isTarget = parsed.toDevice === deviceName || parsed.toDevice === deviceId;

                    if (isSource && !isTarget) {
                        closeInterface(parsed.id);
                    } else if (isTarget && !openInterfaces.has(parsed.id)) {
                        get<NeroInterface>(`/api/interfaces/${parsed.id}`).then((res) => {
                            if (res.success) openInterface(res.data);
                        });
                    }
                }
            } catch {}
        };

        globalEventSource.onerror = () => {
            globalEventSource?.close();
            globalEventSource = null;
            reconnectTimer = setTimeout(
                () => connectGlobalEvents(deviceId || undefined, deviceName || undefined),
                5000,
            );
        };
    }

    function disconnectGlobalEvents() {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        if (globalEventSource) {
            globalEventSource.close();
            globalEventSource = null;
        }
    }

    return {
        get openInterfaces() {
            return openInterfaces;
        },
        openInterface,
        closeInterface,
        closeAll,
        connectGlobalEvents,
        disconnectGlobalEvents,
        setVoiceMigrateCallback(cb: ((targetDevice: string) => void) | null) {
            onVoiceMigrate = cb;
        },
        setPresenceCallback(cb: ((display: string) => void) | null) {
            onPresence = cb;
        },
    };
}

export const interfaces = createInterfacesStore();
