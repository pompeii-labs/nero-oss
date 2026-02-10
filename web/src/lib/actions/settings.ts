import { get, put, del, type NeroResult } from './helpers';

export type NeroSettings = {
    streaming: boolean;
    model: string;
    theme: 'dark' | 'light';
    verbose: boolean;
    historyLimit: number;
};

export type NeroConfig = {
    licenseKey: string | null;
    tunnelUrl?: string;
    port?: number;
    voice: {
        enabled: boolean;
        elevenlabsVoiceId?: string;
    };
    sms: {
        enabled: boolean;
    };
    settings: NeroSettings;
    allowedTools?: string[];
};

export function getSettings(): Promise<NeroResult<NeroConfig>> {
    return get('/api/settings');
}

export function updateSettings(settings: Partial<NeroSettings>): Promise<NeroResult<NeroConfig>> {
    return put('/api/settings', { settings });
}

export function updateLicenseKey(licenseKey: string | null): Promise<NeroResult<void>> {
    return put('/api/settings/license', { licenseKey });
}

export async function getAllowedTools(): Promise<NeroResult<string[]>> {
    const result = await get<{ tools: string[] }>('/api/settings/allowed-tools');
    if (result.success) {
        return { success: true, data: result.data.tools };
    }
    return result;
}

export function revokeAllowedTool(tool: string): Promise<NeroResult<void>> {
    return del(`/api/settings/allowed-tools/${encodeURIComponent(tool)}`);
}

export async function validateModel(modelId: string): Promise<boolean> {
    const result = await get<{ valid: boolean }>(
        `/api/models/validate/${encodeURIComponent(modelId)}`,
    );
    if (result.success) return result.data.valid;
    return true;
}
