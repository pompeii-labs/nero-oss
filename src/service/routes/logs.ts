import { Router, Request, Response } from 'express';
import { getRecentLogs, getLogFilePath, subscribeToLogs, LogEntry } from '../../util/logger.js';

export function createLogsRouter(): Router {
    const router = Router();

    router.get('/logs', (req: Request, res: Response) => {
        const lines = req.query.lines ? parseInt(req.query.lines as string, 10) : 100;
        const level = req.query.level as string | undefined;
        const source = req.query.source as string | undefined;

        let entries = getRecentLogs(lines, level);
        if (source) {
            entries = entries.filter((e) => e.source.toLowerCase() === source.toLowerCase());
        }

        res.json({
            count: entries.length,
            logFile: getLogFilePath(),
            entries,
        });
    });

    router.get('/logs/stream', (req: Request, res: Response) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const level = req.query.level as string | undefined;
        const upperLevel = level?.toUpperCase();

        const heartbeat = setInterval(() => {
            if (res.closed || res.writableEnded) {
                clearInterval(heartbeat);
                return;
            }
            try {
                res.write('data: {}\n\n');
            } catch {
                clearInterval(heartbeat);
            }
        }, 20_000);

        const unsubscribe = subscribeToLogs((entry: LogEntry) => {
            if (res.closed || res.writableEnded) {
                unsubscribe();
                clearInterval(heartbeat);
                return;
            }
            if (upperLevel && entry.level !== upperLevel) return;
            try {
                res.write(`data: ${JSON.stringify(entry)}\n\n`);
            } catch {}
        });

        req.on('close', () => {
            unsubscribe();
            clearInterval(heartbeat);
        });
    });

    return router;
}
