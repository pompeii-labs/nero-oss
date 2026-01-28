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
}

const defaultSettings: NeroSettings = {
    streaming: true,
    model: 'anthropic/claude-sonnet-4.5',
    theme: 'dark',
    verbose: false,
    historyLimit: 20,
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
};

let cachedConfig: NeroConfig | null = null;
let configPath: string | null = null;

export function getConfigDir(): string {
    const localDir = join(process.cwd(), '.nero');
    if (existsSync(localDir)) {
        return localDir;
    }
    return join(homedir(), '.nero');
}

export function getConfigPath(): string {
    if (configPath) return configPath;
    return join(getConfigDir(), 'config.json');
}

async function loadTunnelUrl(): Promise<string | undefined> {
    const tunnelStatePath = join(homedir(), '.nero', 'tunnel.json');
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

    const configPaths = [
        join(process.cwd(), '.nero', 'config.json'),
        join(homedir(), '.nero', 'config.json'),
    ];

    const tunnelUrl = await loadTunnelUrl();

    for (const path of configPaths) {
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
                };
                cachedConfig = merged;
                return merged;
            } catch (error) {
                const err = error as Error;
                console.warn(chalk.yellow(`Failed to parse ${path}: ${err.message}`));
            }
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

export async function updateMcpServerOAuth(serverName: string, oauth: StoredOAuthData): Promise<void> {
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

export function isToolAllowed(tool: string): boolean {
    const config = getConfig();
    return config.allowedTools?.includes(tool) ?? false;
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
        config.allowedTools = config.allowedTools.filter(t => t !== tool);
        await saveConfig(config);
    }
}

export function getAllowedTools(): string[] {
    const config = getConfig();
    return config.allowedTools ?? [];
}
