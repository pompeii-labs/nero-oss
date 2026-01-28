import { Request, Response, NextFunction } from 'express';

export function createAuthMiddleware(licenseKey: string | undefined) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!licenseKey) {
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
