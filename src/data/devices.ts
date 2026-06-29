import { getLux, unwrap } from '../lux/client';
import type { Devices } from '../lux/types';

/** A screen on the LAN that Nero can live on / throw panels to. */
export interface Device {
    id: string;
    name: string;
    kind: string;
    screenW: number;
    screenH: number;
    connected: boolean;
    lastSeen: number;
}

function coerce(r: Devices): Device {
    return {
        id: r.id,
        name: r.name ?? 'device',
        kind: r.kind ?? 'web',
        screenW: r.screen_w ?? 0,
        screenH: r.screen_h ?? 0,
        connected: r.connected ?? false,
        lastSeen: r.last_seen ?? 0,
    };
}

export interface RegisterInput {
    id: string;
    /** Explicit name request (?name=). Omitted -> the server assigns one. */
    requestedName?: string;
    kind?: string;
    screenW: number;
    screenH: number;
}

// Old platform-default names that pre-date server naming; treated as "unnamed" so
// such a device migrates to a real callsign on its next register.
const LEGACY = new Set([
    'mac',
    'phone',
    'pc',
    'tablet',
    'linux',
    'windows',
    'screen',
    'device',
    '',
]);

// NATO phonetic callsigns: short, distinct, easy to say (good for "move to foxtrot").
const POOL = [
    'alpha',
    'bravo',
    'charlie',
    'delta',
    'echo',
    'foxtrot',
    'golf',
    'hotel',
    'india',
    'juliet',
    'kilo',
    'lima',
    'mike',
    'november',
    'oscar',
    'papa',
    'quebec',
    'romeo',
    'sierra',
    'tango',
    'uniform',
    'victor',
    'whiskey',
    'xray',
    'yankee',
    'zulu',
];

const norm = (n: string) => n.trim().toLowerCase();
const isUnnamed = (name: string) => LEGACY.has(norm(name));

/** Decide a device's name: an explicit request wins; an already-named device keeps
 *  its name; otherwise the first display becomes "main" and the rest get a random
 *  callsign not currently in use by another online device. */
function assignName(
    id: string,
    requested: string | undefined,
    all: Device[],
    existing: Device | undefined,
): string {
    if (requested && requested.trim()) return requested.trim();
    if (existing && !isUnnamed(existing.name)) return existing.name;

    const others = all.filter((d) => d.id !== id);
    if (!others.some((d) => norm(d.name) === 'main')) return 'main';

    const cutoff = Date.now() - ONLINE_WINDOW_MS;
    const takenOnline = new Set(
        others.filter((d) => d.lastSeen >= cutoff).map((d) => norm(d.name)),
    );
    const free = POOL.filter((n) => !takenOnline.has(n));
    const pick = free.length ? free : POOL;
    return pick[Math.floor(Math.random() * pick.length)];
}

/** Register or refresh a device (web client reports itself on connect/resize). */
export async function register(input: RegisterInput): Promise<Device> {
    const t = getLux().table('devices');
    const all = (unwrap(await t.select()) as Devices[]).map(coerce);
    const existing = all.find((d) => d.id === input.id);
    const body = {
        id: input.id,
        name: assignName(input.id, input.requestedName, all, existing),
        kind: input.kind ?? 'web',
        screen_w: input.screenW,
        screen_h: input.screenH,
        connected: true,
        last_seen: Date.now(),
    };
    if (existing) unwrap(await t.update(body as never).eq('id', input.id));
    else unwrap(await t.insert(body as never));
    return coerce(body as Devices);
}

export async function heartbeat(id: string): Promise<void> {
    unwrap(
        await getLux()
            .table('devices')
            .update({ last_seen: Date.now(), connected: true } as never)
            .eq('id', id),
    );
}

export async function setConnected(id: string, connected: boolean): Promise<void> {
    unwrap(
        await getLux()
            .table('devices')
            .update({ connected } as never)
            .eq('id', id),
    );
}

export async function list(): Promise<Device[]> {
    const rows = unwrap(
        await getLux().table('devices').select().order('last_seen', { ascending: false }),
    ) as Devices[];
    return rows.map(coerce);
}

/** A device counts as online if it heartbeated within this window. The web
 *  heartbeats every 15s, so stale/closed screens drop off (instead of Nero
 *  thinking a long-gone tab is still a display). */
const ONLINE_WINDOW_MS = 45_000;

export async function listOnline(): Promise<Device[]> {
    const cutoff = Date.now() - ONLINE_WINDOW_MS;
    return (await list()).filter((d) => d.lastSeen >= cutoff);
}
