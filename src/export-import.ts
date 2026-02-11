import { loadConfig, saveConfig, type NeroConfig } from './config.js';
import { db, isDbConnected } from './db/index.js';
import { Memory, Message, Action, Summary, Note, Workspace } from './models/index.js';
import { VERSION } from './util/version.js';

export interface NeroExportData {
    nero_export: true;
    version: 1;
    nero_version: string;
    exported_at: string;
    config: NeroConfig;
    data: {
        memories: any[];
        messages: any[];
        actions: any[];
        summaries: any[];
        notes: any[];
        workspaces: any[];
    };
}

export interface ImportResult {
    config: boolean;
    counts: Record<string, number>;
}

const TABLES = ['memories', 'messages', 'actions', 'summaries', 'notes', 'workspaces'] as const;

const MODEL_MAP = {
    memories: Memory,
    messages: Message,
    actions: Action,
    summaries: Summary,
    notes: Note,
    workspaces: Workspace,
} as const;

function stripSecrets(config: NeroConfig): NeroConfig {
    const stripped = structuredClone(config);
    stripped.licenseKey = null;
    for (const server of Object.values(stripped.mcpServers)) {
        if (server.oauth) {
            server.oauth.tokens = undefined as any;
        }
    }
    return stripped;
}

export async function buildExport(): Promise<NeroExportData> {
    const config = await loadConfig();
    const strippedConfig = stripSecrets(config);

    const data: NeroExportData['data'] = {
        memories: [],
        messages: [],
        actions: [],
        summaries: [],
        notes: [],
        workspaces: [],
    };

    if (isDbConnected()) {
        const [memories, messages, actions, summaries, notes, workspaces] = await Promise.all([
            Memory.list(),
            Message.list(),
            Action.list(),
            Summary.list(),
            Note.list(),
            Workspace.list(),
        ]);

        data.memories = memories;
        data.messages = messages;
        data.actions = actions;
        data.summaries = summaries;
        data.notes = notes;
        data.workspaces = workspaces;
    }

    return {
        nero_export: true,
        version: 1,
        nero_version: VERSION,
        exported_at: new Date().toISOString(),
        config: strippedConfig,
        data,
    };
}

export function validateExportFile(data: unknown): data is NeroExportData {
    if (!data || typeof data !== 'object') return false;
    const obj = data as any;
    if (obj.nero_export !== true) return false;
    if (obj.version !== 1) return false;
    if (!obj.data || typeof obj.data !== 'object') return false;
    for (const table of TABLES) {
        if (!Array.isArray(obj.data[table])) return false;
    }
    return true;
}

export async function runImport(data: NeroExportData): Promise<ImportResult> {
    const counts: Record<string, number> = {};

    if (data.config) {
        const currentConfig = await loadConfig();
        const merged: NeroConfig = {
            ...currentConfig,
            ...data.config,
            licenseKey: currentConfig.licenseKey,
        };
        for (const [name, server] of Object.entries(merged.mcpServers)) {
            const currentServer = currentConfig.mcpServers[name];
            if (currentServer?.oauth) {
                server.oauth = currentServer.oauth;
            }
        }
        await saveConfig(merged);
    }

    if (isDbConnected()) {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            for (const table of TABLES) {
                const rows = data.data[table];
                if (!rows || rows.length === 0) {
                    counts[table] = 0;
                    continue;
                }

                await client.query(`DELETE FROM ${MODEL_MAP[table].tableName}`);

                const keys = Object.keys(rows[0]);
                for (const row of rows) {
                    const values = keys.map((k) => row[k]);
                    const placeholders = keys.map((_, i) => `$${i + 1}`);
                    await client.query(
                        `INSERT INTO ${MODEL_MAP[table].tableName} (${keys.join(', ')}) VALUES (${placeholders.join(', ')})`,
                        values,
                    );
                }

                counts[table] = rows.length;
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    return { config: !!data.config, counts };
}
