import { Command } from 'commander';
import chalk from 'chalk';
import {
    loadConfig,
    getConfigPath,
    saveConfig,
    isOpenRouter,
    OPENROUTER_BASE_URL,
    type NeroConfig,
} from '../config.js';

interface SettableKey {
    description: string;
    parse: (v: string) => unknown;
    set: (config: NeroConfig, value: unknown) => void;
    get: (config: NeroConfig) => unknown;
    allowedValues?: string[];
    usageHint?: string;
}

const BOOLEAN_ALLOWED = ['true', 'false'];

function parseBoolean(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    throw new Error('Expected boolean: true/false');
}

function parseOneOf<T extends string>(value: string, allowed: readonly T[]): T {
    const normalized = value.trim() as T;
    if (allowed.includes(normalized)) return normalized;
    throw new Error(`Expected one of: ${allowed.join(', ')}`);
}

function parseOptionalString(resetWords: string[]) {
    return (value: string): string | undefined => {
        const normalized = value.trim().toLowerCase();
        if (resetWords.includes(normalized)) return undefined;
        return value;
    };
}

function parseOptionalNumber(
    resetWords: string[],
    validate: (n: number) => boolean,
    errorMessage: string,
) {
    return (value: string): number | undefined => {
        const normalized = value.trim().toLowerCase();
        if (resetWords.includes(normalized)) return undefined;
        const parsed = Number(value);
        if (Number.isNaN(parsed) || !validate(parsed)) {
            throw new Error(errorMessage);
        }
        return parsed;
    };
}

const SETTABLE_KEYS: Record<string, SettableKey> = {
    model: {
        description: 'LLM model identifier',
        parse: (v) => v,
        set: (c, v) => (c.llm.model = String(v)),
        get: (c) => c.llm.model,
        usageHint: 'Any valid model identifier string',
    },
    'llm.model': {
        description: 'LLM model identifier',
        parse: (v) => v,
        set: (c, v) => (c.llm.model = String(v)),
        get: (c) => c.llm.model,
        usageHint: 'Any valid model identifier string',
    },
    'settings.model': {
        description: 'LLM model identifier (deprecated, use llm.model)',
        parse: (v) => v,
        set: (c, v) => (c.llm.model = String(v)),
        get: (c) => c.llm.model,
        usageHint: 'Any valid model identifier string',
    },
    baseUrl: {
        description: 'API base URL (or "openrouter" to reset)',
        parse: parseOptionalString(['openrouter']),
        set: (c, v) => (c.llm.baseUrl = v as string | undefined),
        get: (c) => c.llm.baseUrl,
        allowedValues: ['openrouter', '<url>'],
        usageHint: 'Use "openrouter" to reset to default',
    },
    'llm.baseUrl': {
        description: 'API base URL (or "openrouter" to reset)',
        parse: parseOptionalString(['openrouter']),
        set: (c, v) => (c.llm.baseUrl = v as string | undefined),
        get: (c) => c.llm.baseUrl,
        allowedValues: ['openrouter', '<url>'],
        usageHint: 'Use "openrouter" to reset to default',
    },
    streaming: {
        description: 'Enable streaming responses',
        parse: parseBoolean,
        set: (c, v) => (c.settings.streaming = Boolean(v)),
        get: (c) => c.settings.streaming,
        allowedValues: BOOLEAN_ALLOWED,
    },
    'settings.streaming': {
        description: 'Enable streaming responses',
        parse: parseBoolean,
        set: (c, v) => (c.settings.streaming = Boolean(v)),
        get: (c) => c.settings.streaming,
        allowedValues: BOOLEAN_ALLOWED,
    },
    verbose: {
        description: 'Enable verbose logging',
        parse: parseBoolean,
        set: (c, v) => (c.settings.verbose = Boolean(v)),
        get: (c) => c.settings.verbose,
        allowedValues: BOOLEAN_ALLOWED,
    },
    'settings.verbose': {
        description: 'Enable verbose logging',
        parse: parseBoolean,
        set: (c, v) => (c.settings.verbose = Boolean(v)),
        get: (c) => c.settings.verbose,
        allowedValues: BOOLEAN_ALLOWED,
    },
    timezone: {
        description: 'Timezone (or "auto" to reset)',
        parse: parseOptionalString(['auto']),
        set: (c, v) => (c.settings.timezone = v as string | undefined),
        get: (c) => c.settings.timezone,
        allowedValues: ['auto', '<IANA timezone>'],
    },
    'settings.timezone': {
        description: 'Timezone (or "auto" to reset)',
        parse: parseOptionalString(['auto']),
        set: (c, v) => (c.settings.timezone = v as string | undefined),
        get: (c) => c.settings.timezone,
        allowedValues: ['auto', '<IANA timezone>'],
    },
    'voice.enabled': {
        description: 'Enable voice features',
        parse: parseBoolean,
        set: (c, v) => (c.voice.enabled = Boolean(v)),
        get: (c) => c.voice.enabled,
        allowedValues: BOOLEAN_ALLOWED,
    },
    'voice.emotionDetection': {
        description: 'Enable Hume emotion detection in voice',
        parse: parseBoolean,
        set: (c, v) => (c.voice.emotionDetection = Boolean(v)),
        get: (c) => c.voice.emotionDetection,
        allowedValues: BOOLEAN_ALLOWED,
    },
    'voice.stt.provider': {
        description: 'STT provider',
        parse: (v) => parseOneOf(v, ['deepgram'] as const),
        set: (c, v) => (c.voice.stt.provider = v as 'deepgram'),
        get: (c) => c.voice.stt.provider,
        allowedValues: ['deepgram'],
    },
    'voice.stt.model': {
        description: 'STT model',
        parse: (v) => parseOneOf(v, ['flux', 'nova-3'] as const),
        set: (c, v) => (c.voice.stt.model = v as 'flux' | 'nova-3'),
        get: (c) => c.voice.stt.model,
        allowedValues: ['flux', 'nova-3'],
    },
    'voice.stt.flux.eotThreshold': {
        description: 'Flux EOT threshold (0-1, or "unset")',
        parse: parseOptionalNumber(['unset'], (n) => n >= 0 && n <= 1, 'Expected number 0-1'),
        set: (c, v) => (c.voice.stt.flux.eotThreshold = v as number | undefined),
        get: (c) => c.voice.stt.flux.eotThreshold,
        allowedValues: ['unset', '0-1'],
    },
    'voice.stt.flux.eagerEotThreshold': {
        description: 'Flux eager EOT threshold (0-1, or "unset")',
        parse: parseOptionalNumber(['unset'], (n) => n >= 0 && n <= 1, 'Expected number 0-1'),
        set: (c, v) => (c.voice.stt.flux.eagerEotThreshold = v as number | undefined),
        get: (c) => c.voice.stt.flux.eagerEotThreshold,
        allowedValues: ['unset', '0-1'],
    },
    'voice.stt.flux.eotTimeoutMs': {
        description: 'Flux EOT timeout in milliseconds (positive int, or "unset")',
        parse: parseOptionalNumber(
            ['unset'],
            (n) => Number.isInteger(n) && n > 0,
            'Expected positive integer',
        ),
        set: (c, v) => (c.voice.stt.flux.eotTimeoutMs = v as number | undefined),
        get: (c) => c.voice.stt.flux.eotTimeoutMs,
        allowedValues: ['unset', '<positive integer>'],
    },
    'voice.tts.provider': {
        description: 'TTS provider',
        parse: (v) => parseOneOf(v, ['elevenlabs', 'hume'] as const),
        set: (c, v) => (c.voice.tts.provider = v as 'elevenlabs' | 'hume'),
        get: (c) => c.voice.tts.provider,
        allowedValues: ['elevenlabs', 'hume'],
    },
    'voice.tts.elevenlabs.voiceId': {
        description: 'ElevenLabs voice ID',
        parse: (v) => v,
        set: (c, v) => (c.voice.tts.elevenlabs.voiceId = String(v)),
        get: (c) => c.voice.tts.elevenlabs.voiceId,
        usageHint: 'Any valid ElevenLabs voice ID string',
    },
    'sms.enabled': {
        description: 'Enable SMS features',
        parse: parseBoolean,
        set: (c, v) => (c.sms.enabled = Boolean(v)),
        get: (c) => c.sms.enabled,
        allowedValues: BOOLEAN_ALLOWED,
    },
};

function showAllowedValues(key: string, setter: SettableKey): void {
    console.log(chalk.dim(`\n${key} - ${setter.description}`));
    if (setter.allowedValues && setter.allowedValues.length > 0) {
        console.log(chalk.dim(`Allowed values: ${setter.allowedValues.join(', ')}`));
    }
    if (setter.usageHint) {
        console.log(chalk.dim(`Hint: ${setter.usageHint}`));
    }
    console.log();
}

function listAvailableKeys(prefix?: string): void {
    const keys = Object.keys(SETTABLE_KEYS)
        .filter((k) => (prefix ? k.startsWith(prefix) : true))
        .sort();

    console.log(chalk.dim('Available settings:'));
    for (const k of keys) {
        console.log(`  ${chalk.cyan(k)} - ${SETTABLE_KEYS[k].description}`);
    }
}

function findMatchingPrefix(key: string): string | null {
    const parts = key.split('.');
    for (let i = parts.length; i > 0; i--) {
        const prefix = parts.slice(0, i).join('.');
        if (Object.keys(SETTABLE_KEYS).some((k) => k.startsWith(prefix))) {
            return prefix;
        }
    }
    return null;
}

export function registerConfigCommand(program: Command) {
    const configCmd = program.command('config').description('Show or update configuration');

    configCmd.action(async () => {
        const config = await loadConfig();
        const provider = isOpenRouter(config) ? 'OpenRouter' : config.llm.baseUrl || 'custom';

        console.log(chalk.bold('\nNero Configuration:\n'));

        console.log(chalk.dim('Settings:'));
        console.log(
            `  Streaming: ${config.settings.streaming ? chalk.green('on') : chalk.yellow('off')}`,
        );
        console.log(`  Model: ${chalk.cyan(config.llm.model)}`);
        console.log(
            `  Provider: ${chalk.cyan(provider)}${isOpenRouter(config) ? chalk.dim(' (default)') : ''}`,
        );
        console.log(
            `  Verbose: ${config.settings.verbose ? chalk.green('on') : chalk.yellow('off')}`,
        );

        console.log(chalk.dim('\nMCP Servers:'));
        const servers = Object.keys(config.mcpServers || {});
        if (servers.length === 0) {
            console.log(chalk.yellow('  No MCP servers configured'));
        } else {
            servers.forEach((name) => {
                console.log(chalk.green(`  - ${name}`));
            });
        }

        console.log(chalk.dim('\nFeatures:'));
        console.log(
            `  Voice: ${config.voice?.enabled ? chalk.green('enabled') : chalk.dim('disabled')}`,
        );
        console.log(
            `  SMS: ${config.sms?.enabled ? chalk.green('enabled') : chalk.dim('disabled')}`,
        );
        console.log(
            `  License Key: ${config.licenseKey ? chalk.green('configured') : chalk.dim('not set')}`,
        );

        console.log(chalk.dim('\nConfig Path:'));
        console.log(`  ${getConfigPath()}`);
        console.log();
    });

    configCmd
        .command('set <key> [value]')
        .description('Set a configuration value (supports nested keys like voice.stt.model)')
        .action(async (key: string, value: string | undefined) => {
            const setter = SETTABLE_KEYS[key];
            if (!setter) {
                console.error(chalk.red(`Unknown setting: ${key}`));
                const prefix = findMatchingPrefix(key);
                if (prefix) {
                    console.log(chalk.dim(`Showing keys under: ${prefix}`));
                    listAvailableKeys(prefix);
                } else {
                    listAvailableKeys();
                }
                return;
            }

            if (!value || value === '--help' || value === '-h') {
                showAllowedValues(key, setter);
                return;
            }

            let parsed: unknown;
            try {
                parsed = setter.parse(value);
            } catch (error) {
                console.error(chalk.red((error as Error).message));
                showAllowedValues(key, setter);
                return;
            }

            const config = await loadConfig();
            setter.set(config, parsed);
            await saveConfig(config);

            const display =
                parsed === undefined ? chalk.dim('(reset to default)') : chalk.cyan(String(parsed));
            console.log(`${chalk.green('Set')} ${key} = ${display}`);
        });

    configCmd
        .command('get [key]')
        .description('Get a configuration value (or full config with --json)')
        .option('--json', 'Output JSON')
        .option('--env', 'Output as NERO_CONFIG_JSON=... (full config only)')
        .action(async (key: string | undefined, options: { json?: boolean; env?: boolean }) => {
            const config = await loadConfig();

            if (!key) {
                if (options.env) {
                    const json = JSON.stringify(config);
                    console.log(`NERO_CONFIG_JSON=${json}`);
                    return;
                }
                if (options.json) {
                    console.log(JSON.stringify(config, null, 2));
                    return;
                }
                console.error(chalk.red('Missing key. Use --json for full config.'));
                return;
            }

            if (options.env) {
                console.error(chalk.red('The --env option requires no key.'));
                return;
            }

            if (options.json) {
                console.error(chalk.red('The --json option requires no key.'));
                return;
            }

            const getter = SETTABLE_KEYS[key];
            if (!getter) {
                console.error(chalk.red(`Unknown setting: ${key}`));
                return;
            }

            const value = getter.get(config);
            console.log(value !== undefined ? String(value) : chalk.dim('(not set)'));
        });
}
