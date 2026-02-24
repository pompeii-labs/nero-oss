export function isLocalAddress(ip: string): boolean {
    const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    return normalized === '127.0.0.1' || normalized === '::1';
}

export function isPrivateAddress(ip: string): boolean {
    const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    if (normalized === '127.0.0.1' || normalized === '::1') return true;
    if (
        normalized.startsWith('fe80:') ||
        normalized.startsWith('fc00:') ||
        normalized.startsWith('fd00:')
    )
        return true;
    const parts = normalized.split('.').map(Number);
    if (parts.length !== 4) return false;
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    return false;
}
