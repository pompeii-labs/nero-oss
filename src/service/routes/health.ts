import { Router, Request, Response, RequestHandler } from 'express';
import { Nero } from '../../agent/nero.js';
import { loadConfig } from '../../config.js';
import { Logger } from '../../util/logger.js';

export function createHealthRouter(agent: Nero, authMiddleware: RequestHandler) {
    const router = Router();
    const logger = new Logger('Health');

    router.get('/health', (req: Request, res: Response) => {
        const context = agent.getContextUsage();
        res.json({
            status: 'ok',
            agent: {
                contextUsage: context.percentage,
                contextTokens: context.tokens,
            },
        });
    });

    router.use(authMiddleware);

    router.get('/context', (req: Request, res: Response) => {
        const context = agent.getContextUsage();
        res.json({
            tokens: context.tokens,
            limit: context.limit,
            percentage: context.percentage,
            mcpTools: agent.getMcpToolNames(),
        });
    });

    router.get('/history', (req: Request, res: Response) => {
        res.json({
            messages: agent.getLoadedMessages(),
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

    return router;
}
