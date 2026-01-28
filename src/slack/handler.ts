import type { Request, Response } from 'express';
import chalk from 'chalk';
import { Nero } from '../agent/nero.js';

interface SlackMessage {
    text: string;
    channel: string;
    user: string;
    ts: string;
}

export async function handleSlack(req: Request, res: Response, agent: Nero): Promise<void> {
    try {
        const botToken = req.headers.authorization?.replace('Bearer ', '');
        if (!botToken) {
            res.status(401).json({ error: 'Missing bot token' });
            return;
        }

        const { text, channel, user } = req.body as SlackMessage;

        if (!text || !channel) {
            res.status(400).json({ error: 'Missing text or channel' });
            return;
        }

        console.log(chalk.dim(`[slack] From ${user}: ${text.slice(0, 50)}...`));

        res.status(200).json({ ok: true });

        agent.setMedium('slack');
        const response = await agent.chat(text);

        await sendSlackMessage(botToken, channel, response.content);

        console.log(chalk.dim(`[slack] Sent response to ${channel}`));
    } catch (error) {
        const err = error as Error;
        console.error(chalk.red(`[slack] Error: ${err.message}`));
        if (!res.headersSent) {
            res.status(500).json({ error: 'Something went wrong' });
        }
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
