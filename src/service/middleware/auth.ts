import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

function isLocalRequest(req: Request): boolean {
    const ip = req.socket.remoteAddress || req.ip || '';
    const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    return normalized === '127.0.0.1' || normalized === '::1';
}

function verifyKey(provided: string, expected: string): boolean {
    if (provided.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export function createAuthMiddleware(licenseKey: string | undefined) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!licenseKey) {
            return next();
        }

        if (isLocalRequest(req)) {
            return next();
        }

        const providedKey = req.headers['x-license-key'] as string;

        if (!providedKey) {
            return res.status(401).json({ error: 'License key required' });
        }

        if (!verifyKey(providedKey, licenseKey)) {
            return res.status(403).json({ error: 'Invalid license key' });
        }

        next();
    };
}
