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
    model: string;
    baseUrl?: string;
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

export interface VoiceConfig {
    enabled: boolean;
    ttsProvider: 'elevenlabs' | 'hume';
    ttsFallback?: 'elevenlabs' | 'hume';
    sttModel: 'nova-3' | 'flux';
    elevenlabs: ElevenLabsVoiceConfig;
    hume: HumeVoiceConfig;
    flux: FluxSTTConfig;
    emotionDetection?: boolean;
    elevenlabsVoiceId?: string;
}

export interface NeroConfig {
    mcpServers: Record<string, McpServerConfig>;
    licenseKey: string | null;
    tunnelUrl?: string;
    port?: number;
    relayPort?: number;
    bindHost?: string;
    voice: VoiceConfig;
    sms: {
        enabled: boolean;
    };
    settings: NeroSettings;
    allowedTools?: string[];
    proactivity: ProactivityConfig;
    autonomy: AutonomyConfig;
    hooks?: Partial<Record<HookEvent, HookConfig[]>>;
    browser?: {
        headless?: boolean;
        timeout?: number;
    };
    pompeii?: {
        webhookSecret?: string;
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
    model: 'anthropic/claude-opus-4.5',
    theme: 'dark',
    verbose: false,
    historyLimit: 20,
    sessions: defaultSessionSettings,
};

const defaultProactivity: ProactivityConfig = {
    enabled: false,
    notify: false,
    destructive: false,
    protectedBranches: ['main', 'master'],
    intervalMinutes: 10,
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
    mcpServers: {},
    licenseKey: null,
    relayPort: 4848,
    bindHost: '0.0.0.0',
    voice: {
        enabled: true,
        ttsProvider: 'elevenlabs',
        sttModel: 'flux',
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
        flux: {
            eotThreshold: 0.7,
            eotTimeoutMs: 3000,
        },
    },
    sms: {
        enabled: true,
    },
    settings: defaultSettings,
    proactivity: defaultProactivity,
    autonomy: defaultAutonomy,
};

let cachedConfig: NeroConfig | null = null;
let configPath: string | null = null;

function envBool(key: string): boolean | undefined {
    const val = process.env[key];
    if (val === undefined) return undefined;
    return val === '1' || val === 'true';
}

function applyEnvOverrides(config: NeroConfig): void {
    const model = process.env.NERO_MODEL;
    if (model) config.settings.model = model;

    const baseUrl = process.env.NERO_BASE_URL;
    if (baseUrl) config.settings.baseUrl = baseUrl;

    const streaming = envBool('NERO_STREAMING');
    if (streaming !== undefined) config.settings.streaming = streaming;

    const verbose = envBool('NERO_VERBOSE');
    if (verbose !== undefined) config.settings.verbose = verbose;

    const thinkingEnabled = envBool('NERO_THINKING_ENABLED');
    if (thinkingEnabled !== undefined) config.proactivity.enabled = thinkingEnabled;

    const thinkingNotify = envBool('NERO_THINKING_NOTIFY');
    if (thinkingNotify !== undefined) config.proactivity.notify = thinkingNotify;

    const thinkingInterval = process.env.NERO_THINKING_INTERVAL;
    if (thinkingInterval) {
        const val = parseInt(thinkingInterval, 10);
        if (!isNaN(val) && val >= 1) config.proactivity.intervalMinutes = val;
    }

    const autonomyEnabled = envBool('NERO_AUTONOMY_ENABLED');
    if (autonomyEnabled !== undefined) config.autonomy.enabled = autonomyEnabled;

    const autonomyBudget = process.env.NERO_AUTONOMY_TOKEN_BUDGET;
    if (autonomyBudget) {
        const val = parseInt(autonomyBudget, 10);
        if (!isNaN(val) && val >= 0) config.autonomy.dailyTokenBudget = val;
    }

    const voiceEnabled = envBool('NERO_VOICE_ENABLED');
    if (voiceEnabled !== undefined) config.voice.enabled = voiceEnabled;

    const ttsProvider = process.env.NERO_VOICE_TTS_PROVIDER;
    if (ttsProvider === 'elevenlabs' || ttsProvider === 'hume')
        config.voice.ttsProvider = ttsProvider;

    const sttModel = process.env.NERO_VOICE_STT_MODEL;
    if (sttModel === 'nova-3' || sttModel === 'flux') config.voice.sttModel = sttModel;

    const emotionDetection = envBool('NERO_EMOTION_DETECTION');
    if (emotionDetection !== undefined) config.voice.emotionDetection = emotionDetection;

    const smsEnabled = envBool('NERO_SMS_ENABLED');
    if (smsEnabled !== undefined) config.sms.enabled = smsEnabled;

    const port = process.env.NERO_PORT;
    if (port) {
        const val = parseInt(port, 10);
        if (!isNaN(val)) config.port = val;
    }
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

export async function loadConfig(forceReload = false): Promise<NeroConfig> {
    if (cachedConfig && !forceReload) return cachedConfig;

    const tunnelUrl = await loadTunnelUrl();
    const path = getConfigPath();

    if (existsSync(path)) {
        try {
            const content = await readFile(path, 'utf-8');
            const userConfig = JSON.parse(content);
            configPath = path;
            const merged: NeroConfig = {
                ...defaultConfig,
                ...userConfig,
                licenseKey: loadEnvLicenseKey() || userConfig.licenseKey || null,
                tunnelUrl: tunnelUrl || userConfig.tunnelUrl,
                voice: {
                    ...defaultConfig.voice,
                    ...userConfig.voice,
                    elevenlabs: {
                        ...defaultConfig.voice.elevenlabs,
                        ...userConfig.voice?.elevenlabs,
                    },
                    hume: { ...defaultConfig.voice.hume, ...userConfig.voice?.hume },
                    flux: { ...defaultConfig.voice.flux, ...userConfig.voice?.flux },
                },
                settings: {
                    ...defaultSettings,
                    ...userConfig.settings,
                    sessions: { ...defaultSessionSettings, ...userConfig.settings?.sessions },
                },
                proactivity: { ...defaultProactivity, ...userConfig.proactivity },
                autonomy: { ...defaultAutonomy, ...userConfig.autonomy },
            };
            applyEnvOverrides(merged);
            cachedConfig = merged;
            return merged;
        } catch (error) {
            const err = error as Error;
            console.warn(chalk.yellow(`Failed to parse ${path}: ${err.message}`));
        }
    }

    cachedConfig = {
        ...defaultConfig,
        licenseKey: loadEnvLicenseKey() || null,
        tunnelUrl,
    };
    applyEnvOverrides(cachedConfig);
    return cachedConfig;
}

export async function saveConfig(config: NeroConfig): Promise<void> {
    const path = getConfigPath();
    const dir = dirname(path);

    if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
    }

    await writeFile(path, JSON.stringify(config, null, 2));
    cachedConfig = config;
}

export async function updateSettings(updates: Partial<NeroSettings>): Promise<NeroConfig> {
    const config = await loadConfig();
    config.settings = { ...config.settings, ...updates };
    await saveConfig(config);
    return config;
}

export function getConfig(): NeroConfig {
    return cachedConfig || defaultConfig;
}

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export function isOpenRouter(config: NeroConfig): boolean {
    return !config.settings.baseUrl || config.settings.baseUrl === OPENROUTER_BASE_URL;
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
