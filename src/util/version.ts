import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

declare const NERO_VERSION: string | undefined;

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadVersion(): string {
    if (typeof NERO_VERSION !== 'undefined') {
        return NERO_VERSION;
    }

    try {
        const pkgPath = join(__dirname, '../../package.json');
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        return pkg.version || '0.0.0';
    } catch {
        return '0.0.0';
    }
}

export const VERSION = loadVersion();
