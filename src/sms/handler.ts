import type { Request, Response } from 'express';
import { Nero } from '../agent/nero.js';
import { Logger } from '../util/logger.js';

const logger = new Logger('SMS');

export async function handleSms(req: Request, res: Response, agent: Nero): Promise<void> {
    try {
        const { Body, From } = req.body;
        const message = Body?.trim() ?? '';
        const phone = From;

        if (!phone) {
            res.setHeader('Content-Type', 'application/xml');
            return void res.status(400).send('<Response><Message>Invalid request</Message></Response>');
        }

        logger.info(`From ${phone}: ${message.slice(0, 50)}${message.length > 50 ? '...' : ''}`);

        agent.setMedium('sms');
        agent.setActivityCallback((activity) => logger.tool(activity));

        const response = await agent.chat(message);

        agent.setActivityCallback(undefined);

        res.setHeader('Content-Type', 'application/xml');
        return void res.send(
            `<Response><Message>${escapeXml(response.content || "Something went wrong. Try again.")}</Message></Response>`
        );
    } catch (error) {
        const err = error as Error;
        logger.error(err.message);
        agent.setActivityCallback(undefined);
        res.setHeader('Content-Type', 'application/xml');
        return void res.send(
            `<Response><Message>Something went wrong. Try again.</Message></Response>`
        );
    }
}

function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
