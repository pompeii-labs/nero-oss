import type { Request, Response } from 'express';
import crypto from 'crypto';
import { Nero, type ToolActivity } from '../agent/nero.js';
import { NeroConfig } from '../config.js';
import { Logger } from '../util/logger.js';

const logger = new Logger('Pompeii');

interface PompeiiWebhookBody {
    type: string;
    message: {
        id: string;
        content: string;
        user_name?: string;
    };
    conversation_id: string | null;
    workspace: {
        id: string;
        name: string;
    };
    context: Array<{ user_name: string; content: string }>;
    response_message_id: string;
}

function verifySignature(req: Request, secret: string): boolean {
    const signature = req.headers['x-webhook-signature'] as string | undefined;
    if (!signature) return false;

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(req.body));
    const expected = hmac.digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function sendEvent(res: Response, event: Record<string, unknown>): void {
    if (res.closed || res.writableEnded) return;
    try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {}
}

export async function handlePompeii(
    req: Request,
    res: Response,
    agent: Nero,
    config: NeroConfig,
): Promise<void> {
    const webhookSecret = config.pompeii?.webhookSecret;
    if (webhookSecret) {
        if (!verifySignature(req, webhookSecret)) {
            logger.warn('Invalid webhook signature');
            res.status(401).json({ error: 'Invalid signature' });
            return;
        }
    }

    const body = req.body as PompeiiWebhookBody;
    const userName = body.message?.user_name || 'User';
    const content = body.message?.content || '';

    logger.info(`From ${userName}: ${content.slice(0, 50)}${content.length > 50 ? '...' : ''}`);

    agent.setMedium('pompeii');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

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

    agent.setActivityCallback((activity: ToolActivity) => {
        sendEvent(res, {
            type: 'activity',
            tool: activity.tool,
            display_name: activity.displayName,
            status: activity.status,
            args: activity.args,
            result: activity.result,
            error: activity.error,
        });
    });

    try {
        let message = content;
        if (body.context && body.context.length > 0) {
            const contextLines = body.context.map((c) => `${c.user_name}: ${c.content}`).join('\n');
            message = `[Conversation context]\n${contextLines}\n\n${content}`;
        }

        const onChunk = (chunk: string) => {
            sendEvent(res, { type: 'chunk', content: chunk });
        };

        const response = await agent.chat(message, onChunk);

        sendEvent(res, { type: 'done', content: response.content });

        if (!res.closed && !res.writableEnded) {
            res.end();
        }

        logger.info('Response complete');
    } catch (error) {
        const err = error as Error;
        logger.error(`Error: ${err.message}`);

        sendEvent(res, { type: 'error', message: err.message });

        if (!res.closed && !res.writableEnded) {
            res.end();
        }
    } finally {
        clearInterval(heartbeat);
        agent.setActivityCallback(undefined);
    }
}
