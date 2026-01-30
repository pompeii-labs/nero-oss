import { Router, Request, Response } from 'express';
import { Nero } from '../../agent/nero.js';
import { Logger } from '../../util/logger.js';
import { isDbConnected } from '../../db/index.js';
import { Memory } from '../../models/index.js';
import {
    loadConfig,
    saveConfig,
    updateSettings,
    getAllowedTools,
    removeAllowedTool,
    type NeroConfig,
    type McpServerConfig,
} from '../../config.js';

export function createWebRouter(agent: Nero) {
    const router = Router();
    const logger = new Logger('Web');

    router.get('/memories', async (req: Request, res: Response) => {
        if (!isDbConnected()) {
            res.status(503).json({ error: 'Database not connected' });
            return;
        }

        try {
            const memories = await Memory.getRecent(100);
            res.json(memories);
        } catch (error) {
            logger.error(`Failed to get memories: ${(error as Error).message}`);
            res.status(500).json({ error: 'Failed to get memories' });
        }
    });

    router.post('/memories', async (req: Request, res: Response) => {
        if (!isDbConnected()) {
            res.status(503).json({ error: 'Database not connected' });
            return;
        }

        const { body } = req.body;
        if (!body || typeof body !== 'string') {
            res.status(400).json({ error: 'Body is required' });
            return;
        }

        try {
            const memory = await Memory.create({ body, related_to: [], category: null });
            res.json(memory);
        } catch (error) {
            logger.error(`Failed to create memory: ${(error as Error).message}`);
            res.status(500).json({ error: 'Failed to create memory' });
        }
    });

    router.delete('/memories/:id', async (req: Request, res: Response) => {
        if (!isDbConnected()) {
            res.status(503).json({ error: 'Database not connected' });
            return;
        }

        const idParam = req.params.id as string;
        const id = parseInt(idParam, 10);
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid memory ID' });
            return;
        }

        try {
            const memory = await Memory.get(id);
            if (memory) {
                await memory.delete();
            }
            res.json({ success: true });
        } catch (error) {
            logger.error(`Failed to delete memory: ${(error as Error).message}`);
            res.status(500).json({ error: 'Failed to delete memory' });
        }
    });

    router.get('/mcp/servers', async (req: Request, res: Response) => {
        try {
            const config = await loadConfig();
            res.json({
                servers: config.mcpServers,
                tools: agent.getMcpToolNames(),
            });
        } catch (error) {
            logger.error(`Failed to get MCP servers: ${(error as Error).message}`);
            res.status(500).json({ error: 'Failed to get MCP servers' });
        }
    });

    router.post('/mcp/servers', async (req: Request, res: Response) => {
        const { name, config: serverConfig } = req.body as {
            name: string;
            config: McpServerConfig;
        };

        if (!name || !serverConfig) {
            res.status(400).json({ error: 'Name and config are required' });
            return;
        }

        try {
            const config = await loadConfig();
            config.mcpServers[name] = serverConfig;
            await saveConfig(config);
            logger.info(`Added MCP server: ${name}`);
            res.json({ success: true });
        } catch (error) {
            logger.error(`Failed to add MCP server: ${(error as Error).message}`);
            res.status(500).json({ error: 'Failed to add MCP server' });
        }
    });

    router.delete('/mcp/servers/:name', async (req: Request, res: Response) => {
        const name = decodeURIComponent(req.params.name as string);

        try {
            const config = await loadConfig();
            if (!config.mcpServers[name]) {
                res.status(404).json({ error: 'Server not found' });
                return;
            }

            delete config.mcpServers[name];
            await saveConfig(config);
            logger.info(`Removed MCP server: ${name}`);
            res.json({ success: true });
        } catch (error) {
            logger.error(`Failed to remove MCP server: ${(error as Error).message}`);
            res.status(500).json({ error: 'Failed to remove MCP server' });
        }
    });

    router.post('/mcp/servers/:name/toggle', async (req: Request, res: Response) => {
        const name = decodeURIComponent(req.params.name as string);
        const { disabled } = req.body as { disabled: boolean };

        try {
            const config = await loadConfig();
            if (!config.mcpServers[name]) {
                res.status(404).json({ error: 'Server not found' });
                return;
            }

            config.mcpServers[name].disabled = disabled;
            await saveConfig(config);
            logger.info(`${disabled ? 'Disabled' : 'Enabled'} MCP server: ${name}`);
            res.json({ success: true });
        } catch (error) {
            logger.error(`Failed to toggle MCP server: ${(error as Error).message}`);
            res.status(500).json({ error: 'Failed to toggle MCP server' });
        }
    });

    router.get('/settings', async (req: Request, res: Response) => {
        try {
            const config = await loadConfig();
            const sanitized: Partial<NeroConfig> = {
                licenseKey: config.licenseKey ? '••••••••' : null,
                tunnelUrl: config.tunnelUrl,
                port: config.port,
                voice: config.voice,
                sms: config.sms,
                settings: config.settings,
            };
            res.json(sanitized);
        } catch (error) {
            logger.error(`Failed to get settings: ${(error as Error).message}`);
            res.status(500).json({ error: 'Failed to get settings' });
        }
    });

    router.put('/settings', async (req: Request, res: Response) => {
        const { settings } = req.body;

        if (!settings || typeof settings !== 'object') {
            res.status(400).json({ error: 'Settings object is required' });
            return;
        }

        try {
            const config = await updateSettings(settings);
            res.json({
                settings: config.settings,
            });
        } catch (error) {
            logger.error(`Failed to update settings: ${(error as Error).message}`);
            res.status(500).json({ error: 'Failed to update settings' });
        }
    });

    router.put('/settings/license', async (req: Request, res: Response) => {
        const { licenseKey } = req.body as { licenseKey: string | null };

        try {
            const config = await loadConfig();
            config.licenseKey = licenseKey;
            await saveConfig(config);
            logger.info('License key updated');
            res.json({ success: true });
        } catch (error) {
            logger.error(`Failed to update license key: ${(error as Error).message}`);
            res.status(500).json({ error: 'Failed to update license key' });
        }
    });

    router.get('/settings/allowed-tools', (req: Request, res: Response) => {
        res.json({ tools: getAllowedTools() });
    });

    router.get('/models/validate/:modelId(*)', async (req: Request, res: Response) => {
        const modelId = req.params.modelId as string;

        try {
            const response = await fetch(
                `https://openrouter.ai/api/v1/models/${modelId}/endpoints`,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    },
                },
            );

            res.json({ valid: response.ok, modelId });
        } catch {
            res.json({ valid: true, modelId });
        }
    });

    router.delete('/settings/allowed-tools/:tool', async (req: Request, res: Response) => {
        const tool = decodeURIComponent(req.params.tool as string);

        try {
            await removeAllowedTool(tool);
            logger.info(`Revoked allowed tool: ${tool}`);
            res.json({ success: true });
        } catch (error) {
            logger.error(`Failed to revoke tool: ${(error as Error).message}`);
            res.status(500).json({ error: 'Failed to revoke tool' });
        }
    });

    router.get('/integrations/slack/install', async (req: Request, res: Response) => {
        try {
            const config = await loadConfig();
            if (!config.licenseKey) {
                res.status(400).json({ error: 'License key required for Slack integration' });
                return;
            }

            const apiUrl = process.env.BACKEND_URL || 'https://api.magmadeploy.com';
            const response = await fetch(`${apiUrl}/v1/nero/slack/install`, {
                headers: { 'x-license-key': config.licenseKey },
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                res.status(response.status).json({
                    error: data.error || `Failed: ${response.status}`,
                });
                return;
            }

            const data = await response.json();
            res.json(data);
        } catch (error) {
            logger.error(`Failed to get Slack install URL: ${(error as Error).message}`);
            res.status(500).json({ error: 'Failed to get Slack install URL' });
        }
    });

    return router;
}
