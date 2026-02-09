import type { Request, Response } from 'express';
import chalk from 'chalk';
import { NeroConfig } from '../config.js';
import { createWsToken } from '../util/wstoken.js';

function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export async function handleIncomingCall(
    req: Request,
    res: Response,
    config: NeroConfig,
): Promise<void> {
    const { From, CallSid } = req.body;

    console.log(chalk.dim(`[voice] Incoming call (${CallSid})`));

    const tunnelUrl = config.tunnelUrl || `http://localhost:${config.relayPort || 4848}`;
    const wsHost = tunnelUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const wsProtocol = tunnelUrl.startsWith('https') ? 'wss' : 'ws';

    let wsUrl = `${wsProtocol}://${wsHost}/webhook/voice/stream`;
    if (config.licenseKey) {
        const token = createWsToken(config.licenseKey);
        wsUrl += `/token=${token}`;
    }

    const safeFrom = escapeXml(From || '');

    res.setHeader('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="${wsUrl}">
            <Parameter name="phone" value="${safeFrom}" />
        </Stream>
    </Connect>
</Response>`);
}
