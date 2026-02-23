import { get, put, del, type NeroResult } from './helpers';

export type NeroSettings = {
    streaming: boolean;
    theme: 'dark' | 'light';
    verbose: boolean;
    historyLimit: number;
};

export type LlmSettings = {
    model: string;
    baseUrl?: string;
};

export type STTProvider = 'deepgram';
export type STTModel = 'flux' | 'nova-3';

export type NeroConfig = {
    licenseKey: string | null;
    tunnelUrl?: string;
    port?: number;
    llm: LlmSettings;
    voice: {
        enabled: boolean;
        emotionDetection?: boolean;
        stt: {
            provider: STTProvider;
            model: STTModel;
            flux: {
                eotThreshold?: number;
                eagerEotThreshold?: number;
                eotTimeoutMs?: number;
            };
        };
        tts: {
            provider: 'elevenlabs' | 'hume';
            elevenlabs: {
                voiceId: string;
                model: string;
                stability: number;
                similarityBoost: number;
                speed: number;
            };
            hume: {
                voice?: string;
                voiceProvider?: 'HUME_AI' | 'CUSTOM_VOICE';
                description?: string;
                speed?: number;
                version?: string;
            };
        };
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

export function getModelSettings(): Promise<NeroResult<LlmSettings>> {
    return get('/api/settings/model');
}

export function updateModelSettings(
    model: string,
    baseUrl?: string,
): Promise<NeroResult<LlmSettings>> {
    return put('/api/settings/model', { model, baseUrl });
}

export function getGeneralSettings(): Promise<NeroResult<{ settings: NeroSettings }>> {
    return get('/api/settings/general');
}

export function updateGeneralSettings(
    settings: Partial<NeroSettings>,
): Promise<NeroResult<{ settings: NeroSettings }>> {
    return put('/api/settings/general', { settings });
}

export function getVoiceSettings(): Promise<
    NeroResult<{ voice: NonNullable<NeroConfig['voice']> }>
> {
    return get('/api/settings/voice');
}

export type VoiceSettingsUpdate = Partial<
    Pick<NonNullable<NeroConfig['voice']>, 'enabled' | 'emotionDetection'>
> & {
    stt?: Partial<NonNullable<NeroConfig['voice']>['stt']> & {
        flux?: Partial<NonNullable<NeroConfig['voice']>['stt']['flux']>;
    };
    tts?: Partial<NonNullable<NeroConfig['voice']>['tts']> & {
        elevenlabs?: Partial<NonNullable<NeroConfig['voice']>['tts']['elevenlabs']>;
        hume?: Partial<NonNullable<NeroConfig['voice']>['tts']['hume']>;
    };
};

export function updateVoiceSettings(
    voice: VoiceSettingsUpdate,
): Promise<NeroResult<{ voice: NonNullable<NeroConfig['voice']> }>> {
    return put('/api/settings/voice', { voice });
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
