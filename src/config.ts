import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
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

export interface NeroSettings {
    streaming: boolean;
    model: string;
    theme: 'dark' | 'light';
    verbose: boolean;
    historyLimit: number;
}

export interface ProactivityConfig {
    enabled: boolean;
    notify: boolean;
    destructive: boolean;
    protectedBranches: string[];
}

export interface NeroConfig {
    mcpServers: Record<string, McpServerConfig>;
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
    proactivity: ProactivityConfig;
}

const defaultSettings: NeroSettings = {
    streaming: true,
    model: 'anthropic/claude-sonnet-4.5',
    theme: 'dark',
    verbose: false,
    historyLimit: 20,
};

const defaultProactivity: ProactivityConfig = {
    enabled: false,
    notify: false,
    destructive: false,
    protectedBranches: ['main', 'master'],
};

const defaultConfig: NeroConfig = {
    mcpServers: {},
    licenseKey: null,
    voice: {
        enabled: true,
        elevenlabsVoiceId: 'cjVigY5qzO86Huf0OWal',
    },
    sms: {
        enabled: true,
    },
    settings: defaultSettings,
    proactivity: defaultProactivity,
};

let cachedConfig: NeroConfig | null = null;
let configPath: string | null = null;

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
                licenseKey: process.env.NERO_LICENSE_KEY || userConfig.licenseKey || null,
                tunnelUrl: tunnelUrl || userConfig.tunnelUrl,
                settings: { ...defaultSettings, ...userConfig.settings },
                proactivity: { ...defaultProactivity, ...userConfig.proactivity },
            };
            cachedConfig = merged;
            return merged;
        } catch (error) {
            const err = error as Error;
            console.warn(chalk.yellow(`Failed to parse ${path}: ${err.message}`));
        }
    }

    cachedConfig = {
        ...defaultConfig,
        licenseKey: process.env.NERO_LICENSE_KEY || null,
        tunnelUrl,
    };
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
