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
import {
    discoverSkills,
    loadSkill,
    getSkillContent,
    getSkillsDir,
    findSkill,
} from '../../skills/index.js';
import {
    discoverOAuthMetadata,
    registerClient,
    buildAuthorizationUrl,
    exchangeCodeForTokens,
    type OAuthClientRegistration,
    type OAuthAuthorizationServerMetadata,
} from '../../mcp/oauth.js';
import { updateMcpServerOAuth } from '../../config.js';
import type { StoredOAuthData } from '../../mcp/oauth.js';

interface PendingAuth {
    serverName: string;
    codeVerifier: string;
    redirectUri: string;
    clientRegistration: OAuthClientRegistration;
    authServerMetadata: OAuthAuthorizationServerMetadata;
    completed: boolean;
    error?: string;
}

export function createWebRouter(agent: Nero, port?: number) {
    const router = Router();
    const logger = new Logger('Web');
    const pendingAuths = new Map<string, PendingAuth>();

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
            const authStatus: Record<string, boolean> = {};
            for (const [name, cfg] of Object.entries(config.mcpServers)) {
                if (cfg.transport === 'http') {
                    authStatus[name] = !!cfg.oauth?.tokens;
                }
            }
            res.json({
                servers: config.mcpServers,
                tools: agent.getMcpToolNames(),
                authStatus,
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

    router.get('/skills', async (req: Request, res: Response) => {
        try {
            const skills = await discoverSkills();
            res.json({
                skills: skills.map((s) => ({
                    name: s.name,
                    description: s.metadata.description,
                })),
                skillsDir: getSkillsDir(),
            });
        } catch (error) {
            logger.error(`Failed to get skills: ${(error as Error).message}`);
            res.status(500).json({ error: 'Failed to get skills' });
        }
    });

    router.get('/skills/:name', async (req: Request, res: Response) => {
        const name = decodeURIComponent(req.params.name as string);

        try {
            const skill = await loadSkill(name);
            if (!skill) {
                res.status(404).json({ error: 'Skill not found' });
                return;
            }

            res.json({
                name: skill.name,
                path: skill.path,
                metadata: skill.metadata,
                content: skill.content,
            });
        } catch (error) {
            logger.error(`Failed to get skill: ${(error as Error).message}`);
            res.status(500).json({ error: 'Failed to get skill' });
        }
    });

    router.post('/skills/:name/invoke', async (req: Request, res: Response) => {
        const name = decodeURIComponent(req.params.name as string);
        const { args } = req.body as { args?: string[] };

        try {
            const skills = await discoverSkills();
            const skill = findSkill(name, skills);

            if (!skill) {
                res.status(404).json({ error: 'Skill not found' });
                return;
            }

            const content = getSkillContent(skill, args || []);
            res.json({
                skill: {
                    name: skill.name,
                    description: skill.metadata.description,
                },
                content,
            });
        } catch (error) {
            logger.error(`Failed to invoke skill: ${(error as Error).message}`);
            res.status(500).json({ error: 'Failed to invoke skill' });
        }
    });

    router.post('/mcp/servers/:name/auth', async (req: Request, res: Response) => {
        const name = decodeURIComponent(req.params.name as string);

        try {
            const config = await loadConfig();
            const serverConfig = config.mcpServers[name];
            if (!serverConfig) {
                res.status(404).json({ error: 'Server not found' });
                return;
            }
            if (serverConfig.transport !== 'http' || !serverConfig.url) {
                res.status(400).json({ error: 'Server is not an HTTP transport server' });
                return;
            }

            const metadata = await discoverOAuthMetadata(serverConfig.url);
            if (!metadata?.authServer) {
                res.status(400).json({ error: 'No OAuth metadata found for this server' });
                return;
            }

            const servicePort = port || 4847;
            const redirectUri = `http://localhost:${servicePort}/api/mcp/oauth/callback`;

            let clientReg = serverConfig.oauth?.clientRegistration || null;
            if (!clientReg) {
                clientReg = await registerClient(metadata.authServer, 'Nero', redirectUri);
                if (!clientReg) {
                    res.status(500).json({ error: 'Failed to register OAuth client' });
                    return;
                }
            }

            const authResult = buildAuthorizationUrl({
                authServerMetadata: metadata.authServer,
                clientId: clientReg.client_id,
                redirectUri,
            });

            pendingAuths.set(authResult.state, {
                serverName: name,
                codeVerifier: authResult.codeVerifier,
                redirectUri,
                clientRegistration: clientReg,
                authServerMetadata: metadata.authServer,
                completed: false,
            });

            setTimeout(() => pendingAuths.delete(authResult.state), 5 * 60 * 1000);

            res.json({ authUrl: authResult.authUrl });
        } catch (error) {
            logger.error(`Failed to start OAuth flow: ${(error as Error).message}`);
            res.status(500).json({ error: 'Failed to start OAuth flow' });
        }
    });

    router.get('/mcp/oauth/callback', async (req: Request, res: Response) => {
        const state = req.query.state as string;
        const code = req.query.code as string;
        const error = req.query.error as string;

        if (!state || !pendingAuths.has(state)) {
            res.status(400).send(
                '<html><body><h1>Invalid or expired OAuth state</h1><p>Please try again from the Nero dashboard.</p></body></html>',
            );
            return;
        }

        const pending = pendingAuths.get(state)!;

        if (error) {
            pending.error = error;
            pending.completed = true;
            res.send(
                '<html><body><h1>Authentication failed</h1><p>You can close this tab.</p></body></html>',
            );
            return;
        }

        if (!code) {
            pending.error = 'No authorization code received';
            pending.completed = true;
            res.status(400).send(
                '<html><body><h1>No authorization code</h1><p>You can close this tab.</p></body></html>',
            );
            return;
        }

        try {
            const tokens = await exchangeCodeForTokens(
                pending.authServerMetadata,
                pending.clientRegistration.client_id,
                code,
                pending.codeVerifier,
                pending.redirectUri,
            );

            if (!tokens) {
                pending.error = 'Token exchange failed';
                pending.completed = true;
                res.send(
                    '<html><body><h1>Token exchange failed</h1><p>You can close this tab.</p></body></html>',
                );
                return;
            }

            const oauthData: StoredOAuthData = {
                serverUrl: (await loadConfig()).mcpServers[pending.serverName]?.url || '',
                clientRegistration: pending.clientRegistration,
                tokens,
                authServerMetadata: pending.authServerMetadata,
            };
            await updateMcpServerOAuth(pending.serverName, oauthData);

            pending.completed = true;
            logger.info(`OAuth completed for MCP server: ${pending.serverName}`);
            res.send(
                '<html><body><h1>Authentication successful</h1><p>You can close this tab and return to the Nero dashboard.</p></body></html>',
            );
        } catch (err) {
            pending.error = (err as Error).message;
            pending.completed = true;
            logger.error(`OAuth callback error: ${(err as Error).message}`);
            res.send(
                '<html><body><h1>Authentication error</h1><p>You can close this tab.</p></body></html>',
            );
        }
    });

    router.get('/mcp/servers/:name/auth/status', async (req: Request, res: Response) => {
        const name = decodeURIComponent(req.params.name as string);

        try {
            for (const [, pending] of pendingAuths) {
                if (pending.serverName === name && pending.completed) {
                    if (pending.error) {
                        res.json({ authenticated: false, error: pending.error });
                        return;
                    }
                    res.json({ authenticated: true });
                    return;
                }
            }

            const config = await loadConfig();
            const serverConfig = config.mcpServers[name];
            if (serverConfig?.oauth?.tokens) {
                res.json({ authenticated: true });
                return;
            }

            res.json({ authenticated: false });
        } catch (error) {
            logger.error(`Failed to check auth status: ${(error as Error).message}`);
            res.status(500).json({ error: 'Failed to check auth status' });
        }
    });

    router.post('/mcp/servers/:name/logout', async (req: Request, res: Response) => {
        const name = decodeURIComponent(req.params.name as string);

        try {
            const config = await loadConfig();
            if (!config.mcpServers[name]) {
                res.status(404).json({ error: 'Server not found' });
                return;
            }

            delete config.mcpServers[name].oauth;
            await saveConfig(config);
            logger.info(`OAuth tokens cleared for MCP server: ${name}`);
            res.json({ success: true });
        } catch (error) {
            logger.error(`Failed to logout MCP server: ${(error as Error).message}`);
            res.status(500).json({ error: 'Failed to logout' });
        }
    });

    return router;
}
