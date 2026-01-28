import crypto from 'crypto';

const TOKEN_TTL_SECONDS = 60;

export function createWsToken(licenseKey: string): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const hmac = crypto
        .createHmac('sha256', licenseKey)
        .update(timestamp.toString())
        .digest('hex')
        .slice(0, 16);
    return `${timestamp}.${hmac}`;
}

export function verifyWsToken(token: string, licenseKey: string): boolean {
    const parts = token.split('.');
    if (parts.length !== 2) return false;

    const [timestampStr, providedHmac] = parts;
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) return false;

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > TOKEN_TTL_SECONDS) return false;

    const expectedHmac = crypto
        .createHmac('sha256', licenseKey)
        .update(timestampStr)
        .digest('hex')
        .slice(0, 16);

    if (providedHmac.length !== expectedHmac.length) return false;

    return crypto.timingSafeEqual(Buffer.from(providedHmac), Buffer.from(expectedHmac));
}
