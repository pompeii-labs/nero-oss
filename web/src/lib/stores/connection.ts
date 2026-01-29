import { writable } from 'svelte/store';
import { getServerUrl } from '$lib/actions/helpers';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

export const connectionStatus = writable<ConnectionStatus>('connecting');

let pingInterval: ReturnType<typeof setInterval> | null = null;

export async function checkConnection(): Promise<boolean> {
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

export function startConnectionMonitor() {
    if (pingInterval) return;

    const ping = async () => {
        connectionStatus.set('connecting');
        const ok = await checkConnection();
        connectionStatus.set(ok ? 'connected' : 'disconnected');
    };

    ping();
    pingInterval = setInterval(ping, 30000);
}

export function stopConnectionMonitor() {
    if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
    }
}
