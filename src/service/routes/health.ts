import { Router, Request, Response } from 'express';
import semver from 'semver';
import { Nero } from '../../agent/nero.js';
import { loadConfig } from '../../config.js';
import { Logger } from '../../util/logger.js';
import { VERSION } from '../../util/version.js';

export function createHealthRouter(agent: Nero) {
    const router = Router();
    const logger = new Logger('Health');

    router.get('/context', (req: Request, res: Response) => {
        const context = agent.getContextUsage();
        res.json({
            tokens: context.tokens,
            limit: context.limit,
            percentage: context.percentage,
            mcpTools: agent.getMcpToolNames(),
        });
    });

    router.get('/usage', async (req: Request, res: Response) => {
        try {
            const apiKey = process.env.OPENROUTER_API_KEY;
            if (!apiKey) {
                res.status(400).json({ error: 'OPENROUTER_API_KEY not set' });
                return;
            }

            const response = await fetch('https://openrouter.ai/api/v1/key', {
                headers: { Authorization: `Bearer ${apiKey}` },
            });

            if (!response.ok) {
                res.status(response.status).json({
                    error: `OpenRouter API error: ${response.status}`,
                });
                return;
            }

            const data = await response.json();
            res.json(data.data);
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    });

    router.get('/history', async (req: Request, res: Response) => {
        const config = await loadConfig();
        const messages = await agent.getMessageHistory(config.settings.historyLimit);
        res.json({
            messages,
            hasSummary: agent.hasPreviousSummary(),
        });
    });

    router.post('/reload', async (req: Request, res: Response) => {
        try {
            logger.info('Reloading configuration...');
            const newConfig = await loadConfig();
            const result = await agent.reload(newConfig);
            logger.success(`Reloaded with ${result.mcpTools} MCP tools`);
            res.json({
                success: true,
                mcpTools: result.mcpTools,
            });
        } catch (error) {
            const err = error as Error;
            logger.error(`Reload failed: ${err.message}`);
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/update-check', async (req: Request, res: Response) => {
        try {
            const response = await fetch(
                'https://api.github.com/repos/pompeii-labs/nero-oss/releases/latest',
                { headers: { 'User-Agent': 'Nero' } },
            );

            if (!response.ok) {
                res.json({ current: VERSION, latest: null, updateAvailable: false });
                return;
            }

            const data = await response.json();
            const latest = data.tag_name?.replace(/^v/, '') || null;
            const updateAvailable = latest ? semver.gt(latest, VERSION) : false;

            res.json({
                current: VERSION,
                latest,
                updateAvailable,
            });
        } catch {
            res.json({ current: VERSION, latest: null, updateAvailable: false });
        }
    });

    return router;
}
