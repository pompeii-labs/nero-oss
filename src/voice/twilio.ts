import type { Request, Response } from 'express';
import chalk from 'chalk';
import { NeroConfig } from '../config.js';

export async function handleIncomingCall(req: Request, res: Response, config: NeroConfig): Promise<void> {
    const { From, To, CallSid } = req.body;

    console.log(chalk.dim(`[voice] Incoming call from ${From} (${CallSid})`));

    const wsUrl = `wss://${req.get('host')}/webhook/voice/stream`;

    res.setHeader('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="${wsUrl}">
            <Parameter name="phone" value="${From}" />
        </Stream>
    </Connect>
</Response>`);
}
