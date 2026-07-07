/** The `nero` command handlers. Lifecycle drives docker compose; mcp/config/
 *  doctor talk straight to Lux (the "write desired state to Lux" path). */
import { spawn, spawnSync } from 'child_process';
import { join, resolve, basename, dirname } from 'path';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import pkg from '../package.json';
import { c, ok, warn, info, line, kv, die } from './term';
import { ensureDocker, compose, composeCapture } from './docker';
import {
    ensureHome,
    ensureStackEnv,
    writeCompose,
    readEnv,
    luxMode,
    HOME,
    httpsEnabled,
} from './home';
import { ensureCert, lanIps } from './tls';
import { loadConfig } from '@nero/shared/config';

// ---- host-runner: a host-side daemon (not a container) the api proxies code ops to ----
const RUNNER_PID = join(HOME, 'hostrunner.pid');

function runnerPid(): number | null {
    if (!existsSync(RUNNER_PID)) return null;
    const pid = Number(readFileSync(RUNNER_PID, 'utf8').trim());
    if (!pid) return null;
    try {
        process.kill(pid, 0); // signal 0 = liveness check
        return pid;
    } catch {
        unlinkSync(RUNNER_PID);
        return null;
    }
}

function startRunner(): void {
    if (runnerPid()) return;
    // Dev: run the source with bun. Shipped: a compiled binary via NERO_RUNNER_BIN.
    const bin = process.env.NERO_RUNNER_BIN;
    const server = join(import.meta.dir, 'hostrunner', 'server.ts');
    const child = spawn(bin ?? 'bun', bin ? [] : [server], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, ...readEnv() },
    });
    child.unref();
    if (child.pid) writeFileSync(RUNNER_PID, String(child.pid));
}

function stopRunner(): void {
    const pid = runnerPid();
    if (!pid) return;
    try {
        process.kill(pid);
    } catch {
        /* already gone */
    }
    try {
        unlinkSync(RUNNER_PID);
    } catch {
        /* ok */
    }
}

export interface StartOpts {
    foreground?: boolean;
}

export function start(opts: StartOpts = {}): void {
    ensureDocker();
    ensureHome();
    const added = ensureStackEnv();
    // Provision TLS so voice/mic works off localhost (needs a secure context).
    if (ensureCert()) info('Generated a self-signed TLS cert in ~/.nero/certs.');
    writeCompose();

    const env = readEnv();
    if (!env.OPENROUTER_API_KEY) {
        warn(
            `OPENROUTER_API_KEY not set in ${c.cyan('~/.nero/.env')} - Nero can't think until it is.`,
        );
    }
    if (added.length) info(`Generated ${added.join(', ')} in ~/.nero/.env`);

    info('Pulling images…');
    compose(['pull']);
    info('Starting the stack…');
    const code = compose(['up', opts.foreground ? '' : '-d'].filter(Boolean));
    if (code !== 0) die('Stack failed to start. See the output above.');

    // The host-runner runs on the host (real repos/toolchains); the api proxies to it.
    startRunner();

    if (!opts.foreground) {
        const port = env.NERO_WEB_PORT || '80';
        const hport = env.NERO_WEB_HTTPS_PORT || '443';
        const httpUrl = port === '80' ? 'http://localhost' : `http://localhost:${port}`;
        const httpsUrl = hport === '443' ? 'https://localhost' : `https://localhost:${hport}`;
        line();
        ok(`Nero is up  →  ${c.cyan(httpUrl)}`);
        if (httpsEnabled()) info(`${c.dim('https (voice):')} ${c.cyan(httpsUrl)}`);
        info(`${c.dim('logs:')} nero logs    ${c.dim('stop:')} nero stop`);
    }
}

/** Provision a self-signed TLS cert (idempotent) + print how to reach + trust it. */
export function cert(): void {
    ensureHome();
    if (ensureCert()) ok('Generated a self-signed TLS cert in ~/.nero/certs.');
    else info('TLS cert already present (~/.nero/certs). Delete it to regenerate.');
    const hp = readEnv().NERO_WEB_HTTPS_PORT || '443';
    const suf = hp === '443' ? '' : `:${hp}`;
    line();
    info('HTTPS gives the browser a secure context, which voice/mic needs off localhost:');
    kv('local', `https://localhost${suf}`);
    for (const ip of lanIps()) kv('lan', `https://${ip}${suf}`);
    line();
    warn('Self-signed: the browser warns once. On iPhone, visit the URL, then trust it in');
    line('  Settings > General > About > Certificate Trust Settings.');
}

export function stop(): void {
    ensureDocker();
    stopRunner();
    const code = compose(['down']);
    if (code === 0) ok('Nero stopped.');
}

/** Self-update the CLI binary to the latest release + pull the latest stack images. */
export async function update(): Promise<void> {
    const os = process.platform === 'darwin' ? 'darwin' : 'linux';
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    const repo = 'pompeii-labs/nero-oss';

    info('Checking for the latest release…');
    let tag = '';
    try {
        const rel = (await (
            await fetch(`https://api.github.com/repos/${repo}/releases/latest`)
        ).json()) as { tag_name?: string };
        tag = rel.tag_name ?? '';
    } catch {
        die('Could not reach GitHub. Check your connection.');
    }
    if (!tag) die('No release found.');

    if (tag === `v${pkg.version}`) {
        ok(`nero is already up to date (${tag}).`);
    } else {
        info(`Updating nero ${`v${pkg.version}`} -> ${tag}…`);
        const dest = process.execPath;
        const tmp = join(tmpdir(), `nero-${tag}`);
        const url = `https://github.com/${repo}/releases/download/${tag}/nero-${os}-${arch}`;
        if (spawnSync('curl', ['-fsSL', url, '-o', tmp], { stdio: 'inherit' }).status !== 0)
            die('Download failed.');
        spawnSync('chmod', ['+x', tmp]);
        // Overwrite the running binary; a running executable can be replaced in place.
        let mv = spawnSync('mv', [tmp, dest]);
        if (mv.status !== 0) mv = spawnSync('sudo', ['mv', tmp, dest], { stdio: 'inherit' });
        if (mv.status !== 0) die('Could not replace the binary - re-run with sudo.');
        ok(`Updated nero to ${tag}.`);
    }

    // The stack images track :latest; refresh them if a stack is configured.
    if (existsSync(join(HOME, 'docker-compose.yml'))) {
        writeCompose(); // regenerate against the current image tags before pulling
        info('Pulling the latest stack images…');
        compose(['pull']);
        info('Run `nero restart` to apply.');
    } else {
        info('Run `nero start` to bring up the stack.');
    }
}

export function restart(): void {
    ensureDocker();
    writeCompose();
    compose(['restart']);
    ok('Nero restarted.');
}

export function status(): void {
    ensureDocker();
    line(c.bold('Nero stack'));
    compose(['ps']);
    const env = readEnv();
    line();
    kv('lux', luxMode(env) === 'bundled' ? 'bundled engine' : 'external');
    kv('host-runner', runnerPid() ? `up (pid ${runnerPid()})` : 'stopped');
    const wp = env.NERO_WEB_PORT || '80';
    kv('url', wp === '80' ? 'http://localhost' : `http://localhost:${wp}`);
    kv('home', HOME);
}

export function logs(tail: string | undefined, follow: boolean): void {
    ensureDocker();
    compose(['logs', follow ? '-f' : '', '--tail', tail || '200'].filter(Boolean));
}

// ---- mcp (declarative: writes desired state to Lux) ----

export async function mcpList(): Promise<void> {
    const { McpConnection } = await import('../../api/src/models/mcp-connection');
    const rows = await McpConnection.listAll();
    if (!rows.length) {
        line(c.dim('No MCP connections. Add one with `nero mcp add <name> <url>`.'));
        return;
    }
    for (const r of rows) {
        const auth = r.auth?.oauth ? 'oauth' : r.auth?.apiKey ? 'api-key' : 'open';
        const flag = r.disabled ? c.yellow(' disabled') : '';
        line(`${c.bold(r.name)}${flag}`);
        kv('url', r.url || c.dim('(stdio)'));
        kv('transport', r.transport);
        kv('auth', auth);
    }
}

export interface McpAddOpts {
    transport?: 'http' | 'sse' | 'stdio';
    header?: Record<string, string>;
    key?: string;
}

export async function mcpAdd(name: string, url: string, opts: McpAddOpts): Promise<void> {
    if (!name || !url)
        die('Usage: nero mcp add <name> <url> [--transport http|sse|stdio] [--key <token>]');
    const { McpConnection } = await import('../../api/src/models/mcp-connection');
    await McpConnection.upsert({
        name,
        url,
        transport: opts.transport ?? 'http',
        auth: opts.key ? { apiKey: opts.key } : null,
        config: opts.header && Object.keys(opts.header).length ? { headers: opts.header } : null,
        disabled: false,
    });
    ok(`Saved ${c.bold(name)}. Nero will connect it on its next reconcile.`);
}

export async function mcpRemove(name: string): Promise<void> {
    if (!name) die('Usage: nero mcp remove <name>');
    const { McpConnection } = await import('../../api/src/models/mcp-connection');
    await McpConnection.removeByName(name);
    ok(`Removed ${c.bold(name)}.`);
}

export async function mcpReconnect(name: string): Promise<void> {
    if (!name) die('Usage: nero mcp reconnect <name>');
    const { McpConnection } = await import('../../api/src/models/mcp-connection');
    const conn = await McpConnection.getByName(name);
    if (!conn) die(`No MCP connection named ${c.bold(name)}.`);
    await McpConnection.upsert({ name, disabled: false });
    ok(`Flagged ${c.bold(name)} for reconnect.`);
}

// ---- model ----

export async function model(slug?: string): Promise<void> {
    const { Settings } = await import('../../api/src/models/settings');
    if (!slug) {
        const current = (await Settings.getModel().catch(() => null)) ?? loadConfig().model;
        kv('model', current);
        return;
    }
    await Settings.setModel(slug);
    ok(`Model set to ${c.bold(slug)}. Takes effect on the next message.`);
}

// ---- config / doctor ----

export function config(): void {
    const cfg = loadConfig();
    line(c.bold('Nero config') + c.dim('  (resolved from ~/.nero/.env - secrets hidden)'));
    kv('model', cfg.model);
    kv('llm', cfg.llm.baseUrl.includes('openrouter.ai') ? 'openrouter' : cfg.llm.baseUrl);
    kv(
        'llm key',
        cfg.llm.apiKey
            ? c.green('set')
            : cfg.llm.baseUrl.includes('openrouter.ai')
              ? c.red('missing')
              : c.dim('n/a (local)'),
    );
    kv('embed model', cfg.embed.model);
    kv('port', String(cfg.port));
    kv('timezone', cfg.timezone);
    kv('lux', luxMode() === 'bundled' ? 'bundled engine' : 'external');
    kv('tavily', cfg.tavilyApiKey ? c.green('set') : c.dim('unset'));
}

export async function doctor(): Promise<void> {
    line(c.bold('nero doctor'));
    let bad = 0;
    const check = (label: string, pass: boolean, note = '') => {
        line(`  ${pass ? c.green('✓') : c.red('✗')} ${label}${note ? c.dim('  ' + note) : ''}`);
        if (!pass) bad++;
    };

    const cfg = loadConfig();
    const usingOR = cfg.llm.baseUrl.includes('openrouter.ai');
    check(
        'LLM',
        !usingOR || !!cfg.llm.apiKey,
        usingOR
            ? cfg.llm.apiKey
                ? 'openrouter'
                : 'set OPENROUTER_API_KEY in ~/.nero/.env'
            : cfg.llm.baseUrl,
    );
    check('LUX configured', !!cfg.lux.url && !!cfg.lux.secretKey);

    let luxReachable = false;
    try {
        const { getLux } = await import('@nero/shared/lux');
        await getLux().table('mcp_connections').select().limit(1);
        luxReachable = true;
    } catch {
        /* unreachable */
    }
    check('Lux reachable', luxReachable, luxReachable ? '' : 'is the stack up? `nero start`');
    check('host-runner', !!runnerPid(), runnerPid() ? '' : '`nero start` launches it');

    line();
    if (bad) warn(`${bad} issue${bad > 1 ? 's' : ''} to fix.`);
    else ok('All good.');
}

// ---- data restore (seed the bundled Lux from a volume backup) ----

export function restore(backupPath?: string): void {
    ensureDocker();
    if (!backupPath) die('Usage: nero restore <backup.tgz>');
    const abs = resolve(backupPath);
    if (!existsSync(abs)) die(`Backup not found: ${abs}`);
    warn('This REPLACES the bundled Lux data with the backup. Stop the stack first if running.');
    info(`Restoring ${c.cyan(abs)} into the bundled Lux volume…`);
    const r = spawnSync(
        'docker',
        [
            'run',
            '--rm',
            '-v',
            'nero_lux-data:/data',
            '-v',
            `${dirname(abs)}:/backup:ro`,
            'alpine',
            'sh',
            '-c',
            `rm -rf /data/* && tar xzf /backup/${basename(abs)} -C /data && echo restored`,
        ],
        { stdio: 'inherit' },
    );
    if (r.status === 0) ok('Restored. Start the stack: nero start');
    else die('Restore failed (has the stack run once to create the volume?).');
}
