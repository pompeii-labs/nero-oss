import { getServerUrl, buildServerResponse, type ServerResponse } from './helpers';

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

export async function getSettings(): Promise<ServerResponse<NeroConfig>> {
    try {
        const response = await fetch(getServerUrl('/settings'));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return buildServerResponse({ data });
    } catch (e) {
        return buildServerResponse({ error: (e as Error).message });
    }
}

export async function updateSettings(
    settings: Partial<NeroSettings>,
): Promise<ServerResponse<NeroConfig>> {
    try {
        const response = await fetch(getServerUrl('/settings'), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return buildServerResponse({ data });
    } catch (e) {
        return buildServerResponse({ error: (e as Error).message });
    }
}

export async function updateLicenseKey(licenseKey: string | null): Promise<ServerResponse<void>> {
    try {
        const response = await fetch(getServerUrl('/settings/license'), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ licenseKey }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return buildServerResponse({ data: undefined });
    } catch (e) {
        return buildServerResponse({ error: (e as Error).message });
    }
}

export async function getAllowedTools(): Promise<ServerResponse<string[]>> {
    try {
        const response = await fetch(getServerUrl('/settings/allowed-tools'));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return buildServerResponse({ data: data.tools });
    } catch (e) {
        return buildServerResponse({ error: (e as Error).message });
    }
}

export async function revokeAllowedTool(tool: string): Promise<ServerResponse<void>> {
    try {
        const response = await fetch(
            getServerUrl(`/settings/allowed-tools/${encodeURIComponent(tool)}`),
            {
                method: 'DELETE',
            },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return buildServerResponse({ data: undefined });
    } catch (e) {
        return buildServerResponse({ error: (e as Error).message });
    }
}

export async function validateModel(modelId: string): Promise<boolean> {
    try {
        const response = await fetch(
            getServerUrl(`/models/validate/${encodeURIComponent(modelId)}`),
        );
        if (!response.ok) return true;
        const data = await response.json();
        return data.valid;
    } catch {
        return true;
    }
}
