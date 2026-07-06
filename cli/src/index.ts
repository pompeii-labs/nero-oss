#!/usr/bin/env bun
/**
 * The `nero` CLI - a thin host-side manager for the Nero stack (docker compose
 * in ~/.nero), modeled on the Lux CLI. The server itself runs in a container
 * from `service/entrypoint.ts`; this binary never serves anything.
 */
import { loadHomeEnv } from './home';
import * as cmd from './commands';
import { c, line } from './term';
import pkg from '../package.json';

const HELP = `${c.bold('nero')} ${c.dim('- your self-hosted AI companion')}

${c.dim('Usage:')} nero <command> [options]

${c.bold('Lifecycle')}
  start              start the stack          ${c.dim('-f, --foreground')}
  stop               stop the stack
  restart            restart the stack
  status             stack status + URL
  logs               tail logs                ${c.dim('-n <lines>, -f')}

${c.bold('Integrations')}
  mcp [list]                     list MCP connections
  mcp add <name> <url>           ${c.dim('--transport http|sse|stdio  --key <token>  --header k=v')}
  mcp remove <name>
  mcp reconnect <name>

${c.bold('Config')}
  config             resolved config (secrets hidden)
  model [slug]       show or set the model (any OpenRouter slug)
  doctor             preflight checks

  ${c.dim('-v, --version    -h, --help')}

${c.dim('Config lives in ~/.nero/.env (sacred - the CLI only ever adds missing keys).')}`;

/** Minimal arg parser: --flag value, -f bool, positionals. */
function parse(args: string[]): { pos: string[]; flags: Record<string, string | true> } {
    const pos: string[] = [];
    const flags: Record<string, string | true> = {};
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a.startsWith('--')) {
            const k = a.slice(2);
            const next = args[i + 1];
            if (next !== undefined && !next.startsWith('-')) {
                flags[k] = next;
                i++;
            } else flags[k] = true;
        } else if (a.startsWith('-')) {
            flags[a.slice(1)] = true;
        } else pos.push(a);
    }
    return { pos, flags };
}

async function runMcp(rest: string[]): Promise<void> {
    const { pos, flags } = parse(rest);
    const sub = pos[0] ?? 'list';
    switch (sub) {
        case 'list':
            return cmd.mcpList();
        case 'add': {
            const header: Record<string, string> = {};
            if (typeof flags.header === 'string') {
                const i = flags.header.indexOf('=');
                if (i > 0) header[flags.header.slice(0, i)] = flags.header.slice(i + 1);
            }
            return cmd.mcpAdd(pos[1], pos[2], {
                transport: flags.transport as 'http' | 'sse' | 'stdio' | undefined,
                key: typeof flags.key === 'string' ? flags.key : undefined,
                header,
            });
        }
        case 'remove':
        case 'rm':
            return cmd.mcpRemove(pos[1]);
        case 'reconnect':
            return cmd.mcpReconnect(pos[1]);
        default:
            line(c.red(`Unknown mcp command: ${sub}`));
            process.exit(1);
    }
}

async function main(): Promise<void> {
    loadHomeEnv();
    const [command, ...rest] = process.argv.slice(2);
    const { flags } = parse(rest);

    switch (command) {
        case undefined:
        case 'help':
        case '--help':
        case '-h':
            line(HELP);
            break;
        case '--version':
        case '-v':
            line(pkg.version);
            break;
        case 'start':
            cmd.start({ foreground: !!(flags.foreground || flags.f) });
            break;
        case 'stop':
            cmd.stop();
            break;
        case 'restart':
            cmd.restart();
            break;
        case 'status':
            cmd.status();
            break;
        case 'logs':
            cmd.logs(
                typeof flags.n === 'string'
                    ? flags.n
                    : typeof flags.tail === 'string'
                      ? flags.tail
                      : undefined,
                !!(flags.f || flags.follow),
            );
            break;
        case 'mcp':
            await runMcp(rest);
            break;
        case 'config':
            cmd.config();
            break;
        case 'model':
            await cmd.model(parse(rest).pos[0]);
            break;
        case 'doctor':
            await cmd.doctor();
            break;
        default:
            line(c.red(`Unknown command: ${command}`));
            line(HELP);
            process.exit(1);
    }
}

main();
