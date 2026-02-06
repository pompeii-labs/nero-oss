#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { VERSION } from './util/version.js';
import { registerChatCommand } from './commands/chat.js';
import { registerConfigCommand } from './commands/config.js';
import { registerServiceCommands } from './commands/service.js';
import { registerMcpCommands } from './commands/mcp.js';
import { registerRelayCommands } from './commands/relay.js';
import { registerLicenseCommands } from './commands/license.js';
import { registerThinkCommands } from './commands/think.js';
import { registerSkillsCommands } from './commands/skills.js';
import { registerSetupCommands } from './commands/setup.js';

dotenv.config();

const program = new Command();

program.name('nero').description('Open source AI companion').version(VERSION, '-v, --version');

registerChatCommand(program);
registerConfigCommand(program);
registerServiceCommands(program);
registerMcpCommands(program);
registerRelayCommands(program);
registerLicenseCommands(program);
registerThinkCommands(program);
registerSkillsCommands(program);
registerSetupCommands(program);

async function main() {
    try {
        await program.parseAsync(process.argv);
    } catch (error) {
        const err = error as Error;
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
    }
}

main();
