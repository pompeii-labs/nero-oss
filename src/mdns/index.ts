import os from 'os';
import { Logger } from '../util/logger.js';

const logger = new Logger('mDNS');

let responder: any = null;

function getLanIp(): string | null {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]!) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return null;
}

export async function startMdns(): Promise<void> {
    const ip = getLanIp();
    if (!ip) {
        logger.warn('No LAN IP found, skipping mDNS');
        return;
    }

    try {
        const mdns = await import('multicast-dns');
        responder = mdns.default();

        responder.on('query', (query: any) => {
            for (const question of query.questions) {
                if (question.type === 'A' && question.name === 'nero.local') {
                    responder.respond({
                        answers: [
                            {
                                name: 'nero.local',
                                type: 'A',
                                ttl: 120,
                                data: ip,
                            },
                        ],
                    });
                }
            }
        });

        responder.on('error', (err: Error) => {
            logger.debug(`mDNS error: ${err.message}`);
        });

        logger.info(`Broadcasting nero.local -> ${ip}`);
    } catch (error) {
        const err = error as Error;
        logger.debug(`Failed to start mDNS: ${err.message}`);
    }
}

export function stopMdns(): void {
    if (responder) {
        try {
            responder.destroy();
        } catch {}
        responder = null;
    }
}
