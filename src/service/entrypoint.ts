import { loadConfig } from '../config';
import { isLuxConnected, ensureAnonGrants } from '../lib/lux';
import { getMcpClient } from '../mcp/client';
import { Dispatch } from '../models/dispatch';
import { Question } from '../models/question';
import { resumeProjects } from '../projects/runner';
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
    await Dispatch.cancelOrphans()
        .then((n) => n && console.log(`[nero] cleared ${n} orphaned dispatch(es)`))
        .catch((e) => console.error('[nero] orphan cleanup failed:', e));
    await Question.cancelOrphans()
        .then((n) => n && console.log(`[nero] cleared ${n} orphaned question(s)`))
        .catch((e) => console.error('[nero] question cleanup failed:', e));
    await resumeProjects()
        .then((n) => n && console.log(`[nero] reconciled ${n} project(s)`))
        .catch((e) => console.error('[nero] project resume failed:', e));
    await getMcpClient()
        .connectAll()
        .catch((e) => console.error('[nero] mcp connect failed:', e));
}

const server = createServer();
console.log(`[nero] listening on http://localhost:${server.port}  (model: ${cfg.model})`);
