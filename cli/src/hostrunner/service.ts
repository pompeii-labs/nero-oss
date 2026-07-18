/**
 * Installs the host-runner as a real OS service so it survives reboots and log-outs,
 * systemd user unit on Linux, launchd LaunchAgent on macOS. `nero start` calls
 * install(); if the platform/session can't host a service it returns null and the
 * caller falls back to a detached process. Both sides share NERO_RUNNER_TOKEN.
 */
import { spawnSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir, platform } from 'os';
import { HOME, readEnv } from '../home';

export type ServiceKind = 'systemd' | 'launchd';

const LABEL = 'nero-hostrunner';
const MAC_LABEL = 'com.nero.hostrunner';
const RUNNER_ENV = join(HOME, 'hostrunner.env');

/** The command that runs the daemon: a shipped compiled binary, or bun + source in dev. */
function runnerExec(): { bin: string; args: string[] } {
    const bin = process.env.NERO_RUNNER_BIN;
    if (bin) return { bin, args: [] };
    // process.execPath is the absolute bun binary (services get a minimal PATH).
    return { bin: process.execPath, args: [join(import.meta.dir, 'server.ts')] };
}

/** Runner-only env for the service (token + port), kept out of the unit file itself. */
function writeRunnerEnv(): { token: string; port: string } {
    const env = readEnv();
    const token = env.NERO_RUNNER_TOKEN ?? '';
    const port = env.NERO_RUNNER_PORT ?? '4853';
    writeFileSync(RUNNER_ENV, `NERO_RUNNER_TOKEN=${token}\nNERO_RUNNER_PORT=${port}\n`, {
        mode: 0o600,
    });
    return { token, port };
}

function run(cmd: string, args: string[]): boolean {
    const r = spawnSync(cmd, args, { stdio: 'ignore' });
    return r.status === 0;
}

function installSystemd(): ServiceKind | null {
    writeRunnerEnv();
    const { bin, args } = runnerExec();
    const dir = join(homedir(), '.config', 'systemd', 'user');
    mkdirSync(dir, { recursive: true });
    const unit = `[Unit]
Description=Nero host-runner (MCP host + code-project ops sidecar)
After=network.target

[Service]
Type=simple
EnvironmentFile=${RUNNER_ENV}
ExecStart=${[bin, ...args].join(' ')}
Restart=always
RestartSec=2

[Install]
WantedBy=default.target
`;
    writeFileSync(join(dir, `${LABEL}.service`), unit);
    if (!run('systemctl', ['--user', 'daemon-reload'])) return null;
    if (!run('systemctl', ['--user', 'enable', '--now', LABEL])) return null;
    // Best-effort: keep the user instance alive across logout/reboot (may need privileges).
    run('loginctl', ['enable-linger', process.env.USER ?? '']);
    return 'systemd';
}

function macPlistPath(): string {
    return join(homedir(), 'Library', 'LaunchAgents', `${MAC_LABEL}.plist`);
}

function installLaunchd(): ServiceKind | null {
    const { token, port } = writeRunnerEnv();
    const { bin, args } = runnerExec();
    const progArgs = [bin, ...args].map((a) => `        <string>${a}</string>`).join('\n');
    const log = join(HOME, 'hostrunner.log');
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>${MAC_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
${progArgs}
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>NERO_RUNNER_TOKEN</key><string>${token}</string>
        <key>NERO_RUNNER_PORT</key><string>${port}</string>
    </dict>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>${log}</string>
    <key>StandardErrorPath</key><string>${log}</string>
</dict>
</plist>
`;
    const path = macPlistPath();
    mkdirSync(join(homedir(), 'Library', 'LaunchAgents'), { recursive: true });
    writeFileSync(path, plist);
    run('launchctl', ['unload', path]); // ignore: not loaded yet on first run
    if (!run('launchctl', ['load', '-w', path])) return null;
    return 'launchd';
}

/** Install + start the service. Returns the kind, or null if the platform/session
 *  can't host one (caller falls back to a detached process). */
export function installRunnerService(): ServiceKind | null {
    try {
        if (platform() === 'linux') return installSystemd();
        if (platform() === 'darwin') return installLaunchd();
    } catch {
        /* fall through to null -> caller uses the detached fallback */
    }
    return null;
}

/** Stop + remove the service on either platform (best-effort). */
export function stopRunnerService(): void {
    if (platform() === 'linux') {
        run('systemctl', ['--user', 'disable', '--now', LABEL]);
    } else if (platform() === 'darwin') {
        const path = macPlistPath();
        if (existsSync(path)) {
            run('launchctl', ['unload', path]);
            try {
                unlinkSync(path);
            } catch {
                /* ok */
            }
        }
    }
}

/** Whether the service is installed + active. */
export function runnerServiceActive(): ServiceKind | null {
    if (platform() === 'linux') {
        const r = spawnSync('systemctl', ['--user', 'is-active', LABEL], { encoding: 'utf8' });
        return r.stdout?.trim() === 'active' ? 'systemd' : null;
    }
    if (platform() === 'darwin') {
        const r = spawnSync('launchctl', ['list', MAC_LABEL], { stdio: 'ignore' });
        return r.status === 0 ? 'launchd' : null;
    }
    return null;
}
