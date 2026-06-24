import { loadConfig } from '../config';
import { isLuxConnected, ensureAnonGrants } from '../lux/client';
import { getMcpClient } from '../mcp/client';
import { createServer } from './index';

const cfg = loadConfig();

if (!isLuxConnected()) {
    console.warn('[nero] Lux not configured (LUX_URL / LUX_SECRET_KEY). Run `lux start`.');
}
if (!cfg.openrouter.apiKey) {
    console.warn('[nero] OPENROUTER_API_KEY not set — runs will fail until it is.');
}

if (isLuxConnected()) {
    await ensureAnonGrants().catch((e) => console.error('[nero] grant setup failed:', e));
    await getMcpClient()
        .connectAll()
        .catch((e) => console.error('[nero] mcp connect failed:', e));
}

const server = createServer();
console.log(`[nero] listening on http://localhost:${server.port}  (model: ${cfg.model})`);
