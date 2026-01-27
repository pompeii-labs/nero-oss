import type { Request, Response } from 'express';
import chalk from 'chalk';
import { NeroConfig } from '../config.js';
import { Nero } from '../agent/nero.js';

const activeSessions: Map<string, Nero> = new Map();

export async function handleSms(req: Request, res: Response, config: NeroConfig): Promise<void> {
    try {
        const { Body, From } = req.body;
        const message = Body?.trim() ?? '';
        const phone = From;

        if (!phone) {
            res.setHeader('Content-Type', 'application/xml');
            return void res.status(400).send('<Response><Message>Invalid request</Message></Response>');
        }

        console.log(chalk.dim(`[sms] From ${phone}: ${message.slice(0, 50)}...`));

        if (message.toUpperCase() === 'START') {
            activeSessions.delete(phone);

            const nero = new Nero(config);
            await nero.setup();
            activeSessions.set(phone, nero);

            const greeting = "Hey, this is Nero. What can I help you with?\n\nText START anytime to begin a new conversation. Text END to finish.";

            res.setHeader('Content-Type', 'application/xml');
            return void res.send(`<Response><Message>${escapeXml(greeting)}</Message></Response>`);
        }

        if (message.toUpperCase() === 'END') {
            const nero = activeSessions.get(phone);
            if (nero) {
                await nero.cleanup();
                activeSessions.delete(phone);
            }

            res.setHeader('Content-Type', 'application/xml');
            return void res.send(
                `<Response><Message>Got it. Text START anytime to begin a new conversation.</Message></Response>`
            );
        }

        let nero = activeSessions.get(phone);

        if (!nero) {
            nero = new Nero(config);
            await nero.setup();
            activeSessions.set(phone, nero);
        }

        const response = await nero.chat(message);

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
