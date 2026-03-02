import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import chalk from 'chalk';

import type { StoredOAuthData } from './mcp/oauth.js';

export interface McpServerConfig {
    transport?: 'stdio' | 'http';
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
    oauth?: StoredOAuthData;
    disabled?: boolean;
}

export interface SessionSettings {
    enabled: boolean;
    gapThresholdMinutes: number;
    autoSummarize: boolean;
    autoExtractMemories: boolean;
    maxSessionSummaries: number;
}

export interface NeroSettings {
    streaming: boolean;
    theme: 'dark' | 'light';
    verbose: boolean;
    historyLimit: number;
    sessions: SessionSettings;
    timezone?: string;
}

export type HookEvent =
    | 'PreToolUse'
    | 'PostToolUse'
    | 'OnPrompt'
    | 'OnResponse'
    | 'OnMainFinish'
    | 'OnError'
    | 'OnSessionStart';

export interface HookConfig {
    command: string;
    match?: string;
    timeout?: number;
}

export interface ProactivityConfig {
    enabled: boolean;
    notify: boolean;
    destructive: boolean;
    protectedBranches: string[];
    intervalMinutes: number;
}

export interface AutonomyConfig {
    enabled: boolean;
    maxSessionMinutes: number;
    minSleepMinutes: number;
    maxSleepMinutes: number;
    dailyTokenBudget: number;
    maxSessionsPerDay: number;
    destructive: boolean;
    protectedBranches: string[];
    notify: boolean;
}

export interface AmbientConfig {
    enabled: boolean;
    weather: boolean | { lat: number; lon: number };
}

export interface ElevenLabsVoiceConfig {
    voiceId: string;
    model: string;
    stability: number;
    similarityBoost: number;
    speed: number;
}

export interface HumeVoiceConfig {
    voice?: string;
    voiceProvider?: 'HUME_AI' | 'CUSTOM_VOICE';
    description?: string;
    speed?: number;
    version?: string;
}

export interface FluxSTTConfig {
    eotThreshold?: number;
    eagerEotThreshold?: number;
    eotTimeoutMs?: number;
}

export type STTProvider = 'deepgram';
export type STTModel = 'nova-3' | 'flux';

export interface VoiceConfig {
    enabled: boolean;
    emotionDetection?: boolean;
    stt: {
        provider: STTProvider;
        model: STTModel;
        flux: FluxSTTConfig;
    };
    tts: {
        provider: 'elevenlabs' | 'hume';
        elevenlabs: ElevenLabsVoiceConfig;
        hume: HumeVoiceConfig;
    };
}

export interface NeroConfig {
    version: number;
    mcpServers: Record<string, McpServerConfig>;
    licenseKey: string | null;
    tunnelUrl?: string;
    port?: number;
    relayPort?: number;
    bindHost?: string;
    llm: {
        model: string;
        baseUrl?: string;
    };
    voice: VoiceConfig;
    sms: {
        enabled: boolean;
    };
    settings: NeroSettings;
    allowedTools?: string[];
    proactivity: ProactivityConfig;
    autonomy: AutonomyConfig;
    hooks?: Partial<Record<HookEvent, HookConfig[]>>;
    ambient: AmbientConfig;
    browser?: {
        headless?: boolean;
        timeout?: number;
    };
}

const defaultSessionSettings: SessionSettings = {
    enabled: true,
    gapThresholdMinutes: 30,
    autoSummarize: true,
    autoExtractMemories: true,
    maxSessionSummaries: 5,
};

const defaultSettings: NeroSettings = {
    streaming: true,
    theme: 'dark',
    verbose: false,
    historyLimit: 20,
    sessions: defaultSessionSettings,
};

const defaultLlm: NeroConfig['llm'] = {
    model: 'anthropic/claude-opus-4.5',
};

const defaultProactivity: ProactivityConfig = {
    enabled: false,
    notify: false,
    destructive: false,
    protectedBranches: ['main', 'master'],
    intervalMinutes: 10,
};

const defaultAmbient: AmbientConfig = {
    enabled: true,
    weather: true,
};

const defaultAutonomy: AutonomyConfig = {
    enabled: false,
    maxSessionMinutes: 30,
    minSleepMinutes: 15,
    maxSleepMinutes: 120,
    dailyTokenBudget: 500000,
    maxSessionsPerDay: 20,
    destructive: false,
    protectedBranches: ['main', 'master'],
    notify: false,
};

const defaultConfig: NeroConfig = {
    version: 1,
    mcpServers: {},
    licenseKey: null,
    relayPort: 4848,
    bindHost: '0.0.0.0',
    llm: { ...defaultLlm },
    voice: {
        enabled: true,
        stt: {
            provider: 'deepgram',
            model: 'flux',
            flux: {
                eotThreshold: 0.7,
                eotTimeoutMs: 3000,
            },
        },
        tts: {
            provider: 'elevenlabs',
            elevenlabs: {
                voiceId: 'cjVigY5qzO86Huf0OWal',
                model: 'eleven_flash_v2_5',
                stability: 0.5,
                similarityBoost: 0.75,
                speed: 1.05,
            },
            hume: {
                voice: 'Kora',
                version: '2',
                speed: 1.0,
            },
        },
    },
    sms: {
        enabled: true,
    },
    settings: defaultSettings,
    ambient: defaultAmbient,
    proactivity: defaultProactivity,
    autonomy: defaultAutonomy,
};

let cachedConfig: NeroConfig | null = null;
let configPath: string | null = null;
const CURRENT_CONFIG_VERSION = 1;

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
}

function migrateV0ToV1(config: Record<string, unknown>): void {
    const voice = asRecord(config.voice);

    const legacyTtsProvider = voice.ttsProvider;
    const legacySttModel = voice.sttModel;
    const legacyFlux = asRecord(voice.flux);
    const legacyElevenlabs = asRecord(voice.elevenlabs);
    const legacyHume = asRecord(voice.hume);
    const legacyElevenlabsVoiceId = voice.elevenlabsVoiceId;

    const stt = asRecord(voice.stt);
    const tts = asRecord(voice.tts);
    const sttFlux = asRecord(stt.flux);
    const ttsElevenlabs = asRecord(tts.elevenlabs);

    const migratedVoice: Record<string, unknown> = {
        ...voice,
        stt: {
            ...stt,
            provider: stt.provider || 'deepgram',
            model: stt.model || legacySttModel,
            flux: {
                ...legacyFlux,
                ...sttFlux,
            },
        },
        tts: {
            ...tts,
            provider: tts.provider || legacyTtsProvider,
            elevenlabs: {
                ...legacyElevenlabs,
                ...ttsElevenlabs,
                ...(legacyElevenlabsVoiceId ? { voiceId: legacyElevenlabsVoiceId } : {}),
            },
            hume: {
                ...legacyHume,
                ...asRecord(tts.hume),
            },
        },
    };

    delete migratedVoice.ttsProvider;
    delete migratedVoice.sttModel;
    delete migratedVoice.flux;
    delete migratedVoice.elevenlabsVoiceId;

    config.voice = migratedVoice;
}

function migrateConfig(rawConfig: unknown): { config: Record<string, unknown>; migrated: boolean } {
    if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
        return { config: {}, migrated: false };
    }

    const config = { ...(rawConfig as Record<string, unknown>) };
    let migrated = false;

    const parsedVersion =
        typeof config.version === 'number' && Number.isInteger(config.version) ? config.version : 0;

    let version = parsedVersion;

    while (version < CURRENT_CONFIG_VERSION) {
        switch (version) {
            case 0:
                migrateV0ToV1(config);
                config.version = 1;
                version = 1;
                migrated = true;
                break;
            default:
                config.version = CURRENT_CONFIG_VERSION;
                version = CURRENT_CONFIG_VERSION;
                migrated = true;
                break;
        }
    }

    if (config.version !== CURRENT_CONFIG_VERSION) {
        config.version = CURRENT_CONFIG_VERSION;
        migrated = true;
    }

    return { config, migrated };
}

function normalizeUserConfig(userConfig: Partial<NeroConfig>, tunnelUrl?: string): NeroConfig {
    const settingsInput = (userConfig.settings || {}) as Partial<NeroSettings> & {
        model?: string;
        baseUrl?: string;
    };
    const { model: legacyModel, baseUrl: legacyBaseUrl, ...settingsSansModel } = settingsInput;
    const llmInput = (userConfig.llm || {}) as Partial<NeroConfig['llm']>;
    const voiceInput: Partial<VoiceConfig> = userConfig.voice || {};
    const sttInput: Partial<VoiceConfig['stt']> = voiceInput.stt || {};
    const ttsInput: Partial<VoiceConfig['tts']> = voiceInput.tts || {};

    return {
        version: CURRENT_CONFIG_VERSION,
        mcpServers:
            userConfig.mcpServers && typeof userConfig.mcpServers === 'object'
                ? userConfig.mcpServers
                : defaultConfig.mcpServers,
        licenseKey: loadEnvLicenseKey() || userConfig.licenseKey || null,
        tunnelUrl: tunnelUrl || userConfig.tunnelUrl,
        port: userConfig.port,
        relayPort: userConfig.relayPort ?? defaultConfig.relayPort,
        bindHost: userConfig.bindHost ?? defaultConfig.bindHost,
        llm: {
            model: llmInput.model || legacyModel || defaultLlm.model,
            baseUrl: llmInput.baseUrl || legacyBaseUrl || defaultLlm.baseUrl,
        },
        voice: {
            enabled: voiceInput.enabled ?? defaultConfig.voice.enabled,
            emotionDetection: voiceInput.emotionDetection,
            stt: {
                provider: sttInput.provider ?? defaultConfig.voice.stt.provider,
                model: sttInput.model ?? defaultConfig.voice.stt.model,
                flux: {
                    ...defaultConfig.voice.stt.flux,
                    ...(sttInput.flux || {}),
                },
            },
            tts: {
                provider: ttsInput.provider ?? defaultConfig.voice.tts.provider,
                elevenlabs: {
                    ...defaultConfig.voice.tts.elevenlabs,
                    ...(ttsInput.elevenlabs || {}),
                },
                hume: {
                    ...defaultConfig.voice.tts.hume,
                    ...(ttsInput.hume || {}),
                },
            },
        },
        sms: {
            enabled: userConfig.sms?.enabled ?? defaultConfig.sms.enabled,
        },
        settings: {
            ...defaultSettings,
            ...settingsSansModel,
            sessions: {
                ...defaultSessionSettings,
                ...(settingsSansModel.sessions || {}),
            },
        },
        allowedTools: userConfig.allowedTools,
        ambient: {
            ...defaultAmbient,
            ...(userConfig.ambient || {}),
        },
        proactivity: {
            ...defaultProactivity,
            ...(userConfig.proactivity || {}),
        },
        autonomy: {
            ...defaultAutonomy,
            ...(userConfig.autonomy || {}),
        },
        hooks: userConfig.hooks,
        browser: userConfig.browser,
    };
}

export function getNeroHome(): string {
    if (process.env.HOST_HOME) {
        return '/host/home';
    }
    return homedir();
}

export function getConfigDir(): string {
    return join(getNeroHome(), '.nero');
}

export function getConfigPath(): string {
    if (configPath) return configPath;
    return join(getConfigDir(), 'config.json');
}

async function loadTunnelUrl(): Promise<string | undefined> {
    const tunnelStatePath = join(getNeroHome(), '.nero', 'tunnel.json');
    if (existsSync(tunnelStatePath)) {
        try {
            const content = await readFile(tunnelStatePath, 'utf-8');
            const tunnelState = JSON.parse(content);
            return tunnelState.url;
        } catch {
            return undefined;
        }
    }
    return undefined;
}

function loadEnvLicenseKey(): string | null {
    if (process.env.NERO_LICENSE_KEY) return process.env.NERO_LICENSE_KEY;
    const envPath = join(getConfigDir(), '.env');
    if (!existsSync(envPath)) return null;
    try {
        const content = readFileSync(envPath, 'utf-8');
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
            const eqIdx = trimmed.indexOf('=');
            const key = trimmed.slice(0, eqIdx).trim();
            if (key === 'NERO_LICENSE_KEY') {
                let val = trimmed.slice(eqIdx + 1).trim();
                if (
                    (val.startsWith('"') && val.endsWith('"')) ||
                    (val.startsWith("'") && val.endsWith("'"))
                ) {
                    val = val.slice(1, -1);
                }
                return val || null;
            }
        }
    } catch {}
    return null;
}

async function loadNormalizedConfigFromDisk(): Promise<{
    config: NeroConfig;
    needsSave: boolean;
}> {
    const tunnelUrl = await loadTunnelUrl();
    const path = getConfigPath();

    if (existsSync(path)) {
        try {
            const content = await readFile(path, 'utf-8');
            const parsed = JSON.parse(content);
            const { config: migratedConfig, migrated } = migrateConfig(parsed);
            const userConfig = migratedConfig as Partial<NeroConfig>;
            configPath = path;
            return { config: normalizeUserConfig(userConfig, tunnelUrl), needsSave: migrated };
        } catch (error) {
            const err = error as Error;
            console.warn(chalk.yellow(`Failed to parse ${path}: ${err.message}`));
        }
    }

    return { config: normalizeUserConfig({}, tunnelUrl), needsSave: false };
}

export async function loadConfig(forceReload = false): Promise<NeroConfig> {
    if (cachedConfig && !forceReload) return cachedConfig;

    const tunnelUrl = await loadTunnelUrl();
    const path = getConfigPath();

    if (process.env.NERO_MODE === 'contained' && process.env.NERO_CONFIG_JSON) {
        try {
            const parsed = JSON.parse(process.env.NERO_CONFIG_JSON);
            const { config: migratedConfig } = migrateConfig(parsed);
            const userConfig = migratedConfig as Partial<NeroConfig>;
            const merged = normalizeUserConfig(userConfig, tunnelUrl);
            cachedConfig = merged;
            return merged;
        } catch (error) {
            const err = error as Error;
            console.warn(chalk.yellow(`Failed to parse NERO_CONFIG_JSON: ${err.message}`));
        }
    }

    if (existsSync(path)) {
        const { config: merged, needsSave } = await loadNormalizedConfigFromDisk();
        cachedConfig = merged;
        if (needsSave) {
            await saveConfig(merged);
        }
        return merged;
    }

    cachedConfig = {
        ...normalizeUserConfig({}, tunnelUrl),
    };
    return cachedConfig;
}

export async function ensureConfigComplete(): Promise<NeroConfig> {
    const { config } = await loadNormalizedConfigFromDisk();
    await saveConfig(config);
    return config;
}

export async function saveConfig(config: NeroConfig): Promise<void> {
    const path = getConfigPath();
    const dir = dirname(path);

    if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
    }

    const normalized: NeroConfig = {
        ...config,
        version: CURRENT_CONFIG_VERSION,
    };

    await writeFile(path, JSON.stringify(normalized, null, 2));
    cachedConfig = normalized;
}

export async function updateSettings(updates: Partial<NeroSettings>): Promise<NeroConfig> {
    const config = await loadConfig();
    config.settings = { ...config.settings, ...updates };
    await saveConfig(config);
    return config;
}

export async function updateLlmSettings(updates: Partial<NeroConfig['llm']>): Promise<NeroConfig> {
    const config = await loadConfig();
    config.llm = { ...config.llm, ...updates };
    await saveConfig(config);
    return config;
}

export function getConfig(): NeroConfig {
    return cachedConfig || defaultConfig;
}

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export function isOpenRouter(config: NeroConfig): boolean {
    return !config.llm.baseUrl || config.llm.baseUrl === OPENROUTER_BASE_URL;
}

export async function updateMcpServerOAuth(
    serverName: string,
    oauth: StoredOAuthData,
): Promise<void> {
    const config = await loadConfig();
    if (config.mcpServers[serverName]) {
        config.mcpServers[serverName].oauth = oauth;
        await saveConfig(config);
    }
}

export async function getMcpServerOAuth(serverName: string): Promise<StoredOAuthData | undefined> {
    const config = await loadConfig();
    return config.mcpServers[serverName]?.oauth;
}

export function isToolAllowed(tool: string, args?: Record<string, unknown>): boolean {
    const config = getConfig();
    if (!config.allowedTools) return false;

    if (config.allowedTools.includes(tool)) return true;

    if (tool === 'bash' && args?.command) {
        const command = String(args.command).trim();
        for (const allowed of config.allowedTools) {
            if (allowed.startsWith('bash:')) {
                const pattern = allowed.slice('bash:'.length);
                if (matchCommandPattern(command, pattern)) {
                    return true;
                }
            }
        }
    }

    return false;
}

function matchCommandPattern(command: string, pattern: string): boolean {
    if (pattern.endsWith(' *')) {
        const base = pattern.slice(0, -2);
        return command === base || command.startsWith(base + ' ');
    }
    if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        return command.startsWith(prefix);
    }
    return command === pattern;
}

export async function addAllowedTool(tool: string): Promise<void> {
    const config = await loadConfig();
    if (!config.allowedTools) {
        config.allowedTools = [];
    }
    if (!config.allowedTools.includes(tool)) {
        config.allowedTools.push(tool);
        await saveConfig(config);
    }
}

export async function removeAllowedTool(tool: string): Promise<void> {
    const config = await loadConfig();
    if (config.allowedTools) {
        config.allowedTools = config.allowedTools.filter((t) => t !== tool);
        await saveConfig(config);
    }
}

export function getAllowedTools(): string[] {
    const config = getConfig();
    return config.allowedTools ?? [];
}
