import type { Request, Response } from 'express';
import { Nero } from '../agent/nero.js';
import { Logger } from '../util/logger.js';

const logger = new Logger('Slack');

interface SlackMessage {
    text: string;
    channel: string;
    user: string;
    ts: string;
}

export async function handleSlack(req: Request, res: Response, agent: Nero): Promise<void> {
    const retryNum = req.headers['x-slack-retry-num'];
    if (retryNum) {
        logger.debug(`Ignoring Slack retry #${retryNum}`);
        res.status(200).json({ ok: true });
        return;
    }

    res.status(200).json({ ok: true });

    try {
        const botToken = req.headers.authorization?.replace('Bearer ', '');
        if (!botToken) {
            logger.error('Missing bot token');
            return;
        }

        const { text, channel, user } = req.body as SlackMessage;

        if (!text || !channel) {
            logger.error('Missing text or channel');
            return;
        }

        logger.info(`From ${user}: ${text.slice(0, 50)}${text.length > 50 ? '...' : ''}`);

        agent.setMedium('slack');
        agent.setActivityCallback((activity) => logger.tool(activity));

        const response = await agent.chat(text);

        agent.setActivityCallback(undefined);

        const responseText = response.content || "I couldn't generate a response. Try again.";
        await sendSlackMessage(botToken, channel, responseText);

        logger.info(`Sent response to ${channel}`);
    } catch (error) {
        const err = error as Error;
        logger.error(err.message);
        agent.setActivityCallback(undefined);
    }
}

async function sendSlackMessage(token: string, channel: string, text: string): Promise<void> {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            channel,
            text,
        }),
    });

    const data = await response.json();
    if (!data.ok) {
        throw new Error(`Slack API error: ${data.error}`);
    }
}
