import { loadConfig } from '@nero/shared/config';
import { isLuxConnected, ensureAnonGrants } from '@nero/shared/lux';
import { Logger } from '@nero/shared/logger';
import { getMcpClient } from './services/mcp/client';
import { Dispatch } from './models/dispatch';
import { Question } from './models/question';
import { resumeProjects } from './services/projects/runner';
import { createServer } from './server';

const log = new Logger('nero');
const cfg = loadConfig();

if (!isLuxConnected()) {
    log.warn('Lux not configured (LUX_URL / LUX_SECRET_KEY). Run `lux start`.');
}
if (!cfg.openrouter.apiKey) {
    log.warn('OPENROUTER_API_KEY not set; runs will fail until it is.');
}

if (isLuxConnected()) {
    await ensureAnonGrants().catch((e) => log.error('grant setup failed', { error: String(e) }));
    await Dispatch.cancelOrphans()
        .then((n) => n && log.info(`cleared ${n} orphaned dispatch(es)`))
        .catch((e) => log.error('orphan cleanup failed', { error: String(e) }));
    await Question.cancelOrphans()
        .then((n) => n && log.info(`cleared ${n} orphaned question(s)`))
        .catch((e) => log.error('question cleanup failed', { error: String(e) }));
    await resumeProjects()
        .then((n) => n && log.info(`reconciled ${n} project(s)`))
        .catch((e) => log.error('project resume failed', { error: String(e) }));
    await getMcpClient()
        .connectAll()
        .catch((e) => log.error('mcp connect failed', { error: String(e) }));
}

const server = createServer();
log.info(`listening on http://localhost:${server.port} (model: ${cfg.model})`);
