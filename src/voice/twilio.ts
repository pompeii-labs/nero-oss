import type { Request, Response } from 'express';
import chalk from 'chalk';
import { NeroConfig } from '../config.js';
import { createWsToken } from '../util/wstoken.js';

export async function handleIncomingCall(
    req: Request,
    res: Response,
    config: NeroConfig,
): Promise<void> {
    const { From, CallSid } = req.body;

    console.log(chalk.dim(`[voice] Incoming call (${CallSid})`));

    const tunnelUrl = config.tunnelUrl || `http://localhost:${config.port || 4848}`;
    const wsHost = tunnelUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const wsProtocol = tunnelUrl.startsWith('https') ? 'wss' : 'ws';

    let wsUrl = `${wsProtocol}://${wsHost}/webhook/voice/stream`;
    if (config.licenseKey) {
        const token = createWsToken(config.licenseKey);
        wsUrl += `/token=${token}`;
    }

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
