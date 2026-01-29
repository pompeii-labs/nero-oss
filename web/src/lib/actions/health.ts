import { getServerUrl, buildServerResponse, type ServerResponse } from './helpers';

export type ContextInfo = {
    tokens: number;
    limit: number;
    percentage: number;
    mcpTools: string[];
};

export type HistoryInfo = {
    messages: Array<{
        role: 'user' | 'assistant';
        content: string;
        created_at: string;
        medium?: 'cli' | 'api' | 'voice' | 'sms' | 'slack';
        isHistory?: boolean;
    }>;
    hasSummary: boolean;
};

export type ServerInfo = {
    name: string;
    version: string;
    status: string;
    features: {
        voice: boolean;
        sms: boolean;
        database: boolean;
    };
};

export async function getServerInfo(): Promise<ServerResponse<ServerInfo>> {
    try {
        const response = await fetch(getServerUrl('/api'));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return buildServerResponse({ data });
    } catch (e) {
        return buildServerResponse({ error: (e as Error).message });
    }
}

export async function getContext(): Promise<ServerResponse<ContextInfo>> {
    try {
        const response = await fetch(getServerUrl('/api/context'));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return buildServerResponse({ data });
    } catch (e) {
        return buildServerResponse({ error: (e as Error).message });
    }
}

export async function getHistory(): Promise<ServerResponse<HistoryInfo>> {
    try {
        const response = await fetch(getServerUrl('/api/history'));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return buildServerResponse({ data });
    } catch (e) {
        return buildServerResponse({ error: (e as Error).message });
    }
}

export async function reloadConfig(): Promise<ServerResponse<{ mcpTools: number }>> {
    try {
        const response = await fetch(getServerUrl('/api/reload'), { method: 'POST' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return buildServerResponse({ data });
    } catch (e) {
        return buildServerResponse({ error: (e as Error).message });
    }
}

export type HealthInfo = {
    version: string;
    model: string;
    mcpTools: number;
    status: string;
};

export async function getHealth(): Promise<ServerResponse<HealthInfo>> {
    try {
        const response = await fetch(getServerUrl('/health'));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return buildServerResponse({ data });
    } catch (e) {
        return buildServerResponse({ error: (e as Error).message });
    }
}

export type UsageInfo = {
    limit: number | null;
    usage: number;
    limit_remaining: number | null;
    usage_monthly?: number;
    rate_limit?: {
        requests: number;
        interval: string;
    };
};

export async function getUsage(): Promise<ServerResponse<UsageInfo>> {
    try {
        const response = await fetch(getServerUrl('/api/usage'));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data: UsageInfo = await response.json();
        return buildServerResponse({ data });
    } catch (e) {
        return buildServerResponse({ error: (e as Error).message });
    }
}

export async function installSlack(): Promise<ServerResponse<{ url: string }>> {
    try {
        const response = await fetch(getServerUrl('/api/integrations/slack/install'));
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || `HTTP ${response.status}`);
        }
        const data = await response.json();
        return buildServerResponse({ data });
    } catch (e) {
        return buildServerResponse({ error: (e as Error).message });
    }
}

export type UpdateInfo = {
    current: string;
    latest: string | null;
    updateAvailable: boolean;
};

export async function checkForUpdates(): Promise<ServerResponse<UpdateInfo>> {
    try {
        const response = await fetch(getServerUrl('/api/update-check'));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return buildServerResponse({ data });
    } catch (e) {
        return buildServerResponse({ error: (e as Error).message });
    }
}

export type EnvVarInfo = {
    value: string;
    isSet: boolean;
};

export type EnvInfo = {
    env: Record<string, EnvVarInfo>;
    path: string;
};

export async function getEnvVars(): Promise<ServerResponse<EnvInfo>> {
    try {
        const response = await fetch(getServerUrl('/api/admin/env'));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return buildServerResponse({ data });
    } catch (e) {
        return buildServerResponse({ error: (e as Error).message });
    }
}

export async function updateEnvVars(
    env: Record<string, string>,
): Promise<ServerResponse<{ success: boolean; message: string }>> {
    try {
        const response = await fetch(getServerUrl('/api/admin/env'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ env }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return buildServerResponse({ data });
    } catch (e) {
        return buildServerResponse({ error: (e as Error).message });
    }
}

export async function restartService(): Promise<
    ServerResponse<{ success: boolean; message: string }>
> {
    try {
        const response = await fetch(getServerUrl('/api/admin/restart'), {
            method: 'POST',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return buildServerResponse({ data });
    } catch (e) {
        return buildServerResponse({ error: (e as Error).message });
    }
}
