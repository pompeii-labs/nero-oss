/**
 * Everything under ~/.nero - the stack's home. The CLI owns the compose file
 * (regenerated, managed) but treats `.env` as SACRED: it only ever APPENDS
 * missing keys, never edits or removes what's already there.
 */
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { randomBytes } from 'crypto';

export const HOME = join(homedir(), '.nero');
export const ENV_PATH = join(HOME, '.env');
export const COMPOSE_PATH = join(HOME, 'docker-compose.yml');

/** Image tags the generated compose pulls. */
const IMG_API = process.env.NERO_API_IMAGE || 'ghcr.io/pompeii-labs/nero-api:latest';
const IMG_WEB = process.env.NERO_WEB_IMAGE || 'ghcr.io/pompeii-labs/nero-web:latest';
const IMG_MEDIA = process.env.NERO_MEDIA_IMAGE || 'ghcr.io/pompeii-labs/nero-media:latest';
const IMG_LUX = process.env.NERO_LUX_IMAGE || 'ghcr.io/lux-db/lux:latest';

export function ensureHome(): void {
    if (!existsSync(HOME)) mkdirSync(HOME, { recursive: true });
}

/** Parse ~/.nero/.env into a flat map (ignores comments / blanks). */
export function readEnv(): Record<string, string> {
    if (!existsSync(ENV_PATH)) return {};
    const out: Record<string, string> = {};
    for (const raw of readFileSync(ENV_PATH, 'utf8').split('\n')) {
        const l = raw.trim();
        if (!l || l.startsWith('#')) continue;
        const i = l.indexOf('=');
        if (i < 0) continue;
        out[l.slice(0, i).trim()] = l
            .slice(i + 1)
            .trim()
            .replace(/^["']|["']$/g, '');
    }
    return out;
}

/** Load ~/.nero/.env into process.env (without overriding already-set vars), so
 *  Lux-touching commands (mcp, config, doctor) read the right connection. */
export function loadHomeEnv(): void {
    for (const [k, v] of Object.entries(readEnv())) {
        if (process.env[k] === undefined) process.env[k] = v;
    }
}

/** Append only the keys not already present. Never touches existing lines. */
export function appendEnv(additions: Record<string, string>, banner?: string): string[] {
    ensureHome();
    const current = readEnv();
    const missing = Object.entries(additions).filter(([k]) => !(k in current));
    if (missing.length === 0) return [];
    const block =
        (existsSync(ENV_PATH) && readFileSync(ENV_PATH, 'utf8').length ? '\n' : '') +
        (banner ? `# ${banner}\n` : '') +
        missing.map(([k, v]) => `${k}=${v}`).join('\n') +
        '\n';
    writeFileSync(ENV_PATH, (existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '') + block);
    return missing.map(([k]) => k);
}

const key = (prefix: string) => `${prefix}${randomBytes(24).toString('hex')}`;

export type LuxMode = 'bundled' | 'external';

/** Bundled unless the user pointed Lux at something that isn't our compose engine.
 *  Detect via the internal `lux` service host in either the HTTP or the direct URL. */
export function luxMode(env = readEnv()): LuxMode {
    const url = env.LUX_URL ?? '';
    const direct = env.LUX_DIRECT_URL ?? '';
    if (!url && !direct) return 'bundled';
    return url.includes('//lux:') || direct.includes('@lux:') ? 'bundled' : 'external';
}

/**
 * Make sure the env has what the stack needs. Generates Lux creds for the
 * bundled engine on first run (persisted to .env). Returns the keys it added.
 */
export function ensureStackEnv(): string[] {
    const env = readEnv();
    const added: string[] = [];

    if (luxMode(env) === 'bundled') {
        const secret = env.LUX_SECRET_KEY || key('lux_sec_local_');
        const pub = env.LUX_PUBLISHABLE_KEY || key('lux_pub_local_');
        added.push(
            ...appendEnv(
                {
                    LUX_SECRET_KEY: secret,
                    LUX_PUBLISHABLE_KEY: pub,
                    // api HTTP client -> engine (SDK; Bearer == secret key)
                    LUX_URL: 'http://lux:8080',
                    // api RESP/direct -> engine (BullMQ over the Redis protocol)
                    LUX_DIRECT_URL: `lux://:${secret}@lux:6379`,
                    // The browser reaches Lux same-origin via the web's nginx /lux proxy,
                    // so no browser-facing engine URL is needed here.
                },
                'Bundled Lux engine (auto-generated; safe to leave)',
            ),
        );
    }

    // Media sidecar + host-runner. The containerized api reaches the host-side runner
    // over host.docker.internal; both sides share NERO_RUNNER_TOKEN.
    const runnerToken = env.NERO_RUNNER_TOKEN || key('nero_runner_');
    added.push(
        ...appendEnv(
            {
                NERO_MEDIA_URL: 'ws://media:7070',
                NERO_RUNNER_URL: 'http://host.docker.internal:4853',
                NERO_RUNNER_TOKEN: runnerToken,
                NERO_RUNNER_PORT: '4853',
            },
            'Media sidecar + host-runner',
        ),
    );
    return added;
}

/** Render the managed docker-compose.yml for the current env. */
export function renderCompose(env = readEnv()): string {
    const bundled = luxMode(env) === 'bundled';
    const lux = bundled
        ? `  lux:
    image: ${IMG_LUX}
    restart: unless-stopped
    environment:
      LUX_AUTH_ENABLED: "1"
      LUX_PASSWORD: "\${LUX_SECRET_KEY}"
      LUX_AUTH_SECRET_KEY: "\${LUX_SECRET_KEY}"
      LUX_AUTH_PUBLISHABLE_KEY: "\${LUX_PUBLISHABLE_KEY}"
      LUX_PORT: "6379"
      LUX_HTTP_PORT: "8080"
      LUX_BIND_HOST: "0.0.0.0"
      LUX_DATA_DIR: /data
      LUX_STORAGE_MODE: tiered
      LUX_STORAGE_DIR: /data/storage
    volumes:
      - lux-data:/data
    ports:
      - "\${NERO_LUX_PORT:-4850}:8080"
      - "\${NERO_LUX_RESP_PORT:-4851}:6379"
`
        : '';
    const apiDeps = bundled ? '[lux, media]' : '[media]';

    return `# Generated by the nero CLI - managed file. Configure via ~/.nero/.env
name: nero
services:
${lux}  media:
    image: ${IMG_MEDIA}
    restart: unless-stopped
    env_file: [.env]
    ports:
      - "\${NERO_MEDIA_PORT:-4852}:7070"
  api:
    image: ${IMG_API}
    restart: unless-stopped
    env_file: [.env]
    depends_on: ${apiDeps}
    extra_hosts:
      - "host.docker.internal:host-gateway"
    ports:
      - "\${NERO_API_PORT:-4849}:4848"
  web:
    image: ${IMG_WEB}
    restart: unless-stopped
    depends_on: [api]
    ports:
      - "\${NERO_PORT:-4848}:80"
${bundled ? 'volumes:\n  lux-data:\n' : ''}`;
}

/** Write the managed compose file (always regenerated). */
export function writeCompose(env = readEnv()): void {
    ensureHome();
    writeFileSync(COMPOSE_PATH, renderCompose(env));
}
