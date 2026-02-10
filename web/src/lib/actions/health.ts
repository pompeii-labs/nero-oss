import { get, post, type NeroResult } from './helpers';

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

export type HealthInfo = {
    version: string;
    model: string;
    mcpTools: number;
    status: string;
};

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

export type UpdateInfo = {
    current: string;
    latest: string | null;
    updateAvailable: boolean;
};

export type EnvVarInfo = {
    value: string;
    isSet: boolean;
};

export type EnvInfo = {
    env: Record<string, EnvVarInfo>;
    path: string;
};

export function getServerInfo(): Promise<NeroResult<ServerInfo>> {
    return get('/api');
}

export function getContext(): Promise<NeroResult<ContextInfo>> {
    return get('/api/context');
}

export function getHistory(): Promise<NeroResult<HistoryInfo>> {
    return get('/api/history');
}

export function reloadConfig(): Promise<NeroResult<{ mcpTools: number; loadedSkills?: string[] }>> {
    return post('/api/reload');
}

export function getHealth(): Promise<NeroResult<HealthInfo>> {
    return get('/health');
}

export function getUsage(): Promise<NeroResult<UsageInfo>> {
    return get('/api/usage');
}

export function installSlack(): Promise<NeroResult<{ url: string }>> {
    return get('/api/integrations/slack/install');
}

export function checkForUpdates(): Promise<NeroResult<UpdateInfo>> {
    return get('/api/update-check');
}

export function getEnvVars(): Promise<NeroResult<EnvInfo>> {
    return get('/api/admin/env');
}

export function updateEnvVars(
    env: Record<string, string>,
): Promise<NeroResult<{ success: boolean; message: string }>> {
    return post('/api/admin/env', { env });
}

export function restartService(): Promise<NeroResult<{ success: boolean; message: string }>> {
    return post('/api/admin/restart');
}
