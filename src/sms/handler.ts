import type { Request, Response } from 'express';
import { Nero } from '../agent/nero.js';
import { Logger } from '../util/logger.js';
import { saveUpload, type FileRef } from '../files/index.js';

const logger = new Logger('SMS');

export async function handleSms(req: Request, res: Response, agent: Nero): Promise<void> {
    try {
        const { Body, From, NumMedia } = req.body;
        const message = Body?.trim() ?? '';
        const phone = From;
        const mediaCount = parseInt(NumMedia || '0', 10);

        if (!phone) {
            res.setHeader('Content-Type', 'application/xml');
            return void res
                .status(400)
                .send('<Response><Message>Invalid request</Message></Response>');
        }

        logger.info(
            `From ${phone}: ${message.slice(0, 50)}${message.length > 50 ? '...' : ''}${mediaCount > 0 ? ` [${mediaCount} media]` : ''}`,
        );

        agent.setMedium('sms');
        agent.setActivityCallback((activity) => logger.tool(activity));

        const attachments: FileRef[] = [];
        if (mediaCount > 0) {
            for (let i = 0; i < mediaCount; i++) {
                const mediaUrl = req.body[`MediaUrl${i}`];
                const mediaType = req.body[`MediaContentType${i}`];
                if (!mediaUrl) continue;

                try {
                    const mediaResponse = await fetch(mediaUrl);
                    if (mediaResponse.ok) {
                        const buffer = Buffer.from(await mediaResponse.arrayBuffer());
                        const ext = mediaType?.split('/')[1] || 'bin';
                        const ref = await saveUpload(
                            buffer,
                            `mms-${i}.${ext}`,
                            mediaType || 'application/octet-stream',
                        );
                        attachments.push(ref);
                    }
                } catch (err) {
                    logger.warn(`Failed to fetch MMS media ${i}: ${(err as Error).message}`);
                }
            }
        }

        const chatInput =
            attachments.length > 0 ? { message: message || 'What is this?', attachments } : message;

        const response = await agent.chat(chatInput);

        agent.setActivityCallback(undefined);

        res.setHeader('Content-Type', 'application/xml');
        return void res.send(
            `<Response><Message>${escapeXml(response.content || 'Something went wrong. Try again.')}</Message></Response>`,
        );
    } catch (error) {
        const err = error as Error;
        logger.error(err.message);
        agent.setActivityCallback(undefined);
        res.setHeader('Content-Type', 'application/xml');
        return void res.send(
            `<Response><Message>Something went wrong. Try again.</Message></Response>`,
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
