#!/usr/bin/env node
import dotenv from 'dotenv';
import { initDb, migrateDb } from '../db/index.js';
import { loadConfig } from '../config.js';
import { NeroService } from './index.js';
import { Logger } from '../util/logger.js';
import { VERSION } from '../util/version.js';

dotenv.config();

const logger = new Logger('Nero');

async function main() {
    const port = parseInt(process.env.PORT || '4848');

    logger.info(`Starting Nero v${VERSION}`);
    logger.info('Initializing database...');
    await initDb();
    await migrateDb();

    const config = await loadConfig();

    const service = new NeroService(port, config);
    await service.start();
}

main().catch((error) => {
    logger.error(error);
    process.exit(1);
});
