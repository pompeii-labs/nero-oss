import { Request, Response, NextFunction } from 'express';

function isLocalRequest(req: Request): boolean {
    const host = req.hostname || req.headers.host || '';
    return (
        host === 'localhost' ||
        host.startsWith('localhost:') ||
        host === '127.0.0.1' ||
        host.startsWith('127.0.0.1:')
    );
}

export function createAuthMiddleware(licenseKey: string | undefined) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!licenseKey) {
            return next();
        }

        if (isLocalRequest(req)) {
            return next();
        }

        const secFetchSite = req.headers['sec-fetch-site'] as string;
        if (secFetchSite === 'same-origin') {
            return next();
        }

        const providedKey = req.headers['x-license-key'] as string;

        if (!providedKey) {
            return res.status(401).json({ error: 'License key required' });
        }

        if (providedKey !== licenseKey) {
            return res.status(403).json({ error: 'Invalid license key' });
        }

        next();
    };
}
