import { getServerUrl } from '$lib/actions/helpers';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

function createConnectionStore() {
    let current = $state<ConnectionStatus>('connecting');
    let pingInterval: ReturnType<typeof setInterval> | null = null;

    async function checkConnection(): Promise<boolean> {
        try {
            const response = await fetch(getServerUrl('/health'), {
                method: 'GET',
                signal: AbortSignal.timeout(5000),
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    function start() {
        if (pingInterval) return;

        const ping = async () => {
            current = 'connecting';
            const ok = await checkConnection();
            current = ok ? 'connected' : 'disconnected';
        };

        ping();
        pingInterval = setInterval(ping, 30000);
    }

    function stop() {
        if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
        }
    }

    async function retry() {
        current = 'connecting';
        const ok = await checkConnection();
        current = ok ? 'connected' : 'disconnected';
    }

    return {
        get value() {
            return current;
        },
        start,
        stop,
        retry,
        checkConnection,
    };
}

export const connection = createConnectionStore();
