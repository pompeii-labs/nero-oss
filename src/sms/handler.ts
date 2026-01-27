import type { Request, Response } from 'express';
import chalk from 'chalk';
import { Nero } from '../agent/nero.js';

export async function handleSms(req: Request, res: Response, agent: Nero): Promise<void> {
    try {
        const { Body, From } = req.body;
        const message = Body?.trim() ?? '';
        const phone = From;

        if (!phone) {
            res.setHeader('Content-Type', 'application/xml');
            return void res.status(400).send('<Response><Message>Invalid request</Message></Response>');
        }

        console.log(chalk.dim(`[sms] From ${phone}: ${message.slice(0, 50)}...`));

        agent.setMedium('sms');
        const response = await agent.chat(message);

        res.setHeader('Content-Type', 'application/xml');
        return void res.send(
            `<Response><Message>${escapeXml(response.content || "Something went wrong. Try again.")}</Message></Response>`
        );
    } catch (error) {
        const err = error as Error;
        console.error(chalk.red(`[sms] Error: ${err.message}`));
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
