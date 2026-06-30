import { DataModel } from './datamodel';
import { getLux, unwrap } from '../lib/lux';
import type { Devices } from '../lux/types';

export interface DeviceData {
    id: string;
    name: string;
    kind: string;
    screen_w: number;
    screen_h: number;
    connected: boolean;
    last_seen: number;
}

export interface RegisterInput {
    id: string;
    /** Explicit name request (?name=). Omitted -> the server assigns one. */
    requestedName?: string;
    kind?: string;
    screen_w: number;
    screen_h: number;
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

/** A device counts as online if it heartbeated within this window. The web
 *  heartbeats every 15s, so stale/closed screens drop off. */
const ONLINE_WINDOW_MS = 45_000;

const norm = (n: string) => n.trim().toLowerCase();
const isUnnamed = (name: string) => LEGACY.has(norm(name));

/** A screen on the LAN that Nero can live on / throw panels to. */
export class Device extends DataModel<DeviceData> {
    static readonly tableName = 'devices';

    name!: string;
    kind!: string;
    screen_w!: number;
    screen_h!: number;
    connected!: boolean;
    last_seen!: number;

    constructor(data: DeviceData) {
        super();
        Object.assign(this, data);
    }

    /** Decide a device's name: an explicit request wins; an already-named device keeps
     *  its name; otherwise the first display becomes "main" and the rest get a random
     *  callsign not currently in use by another online device. */
    private static assignName(
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
            others.filter((d) => d.last_seen >= cutoff).map((d) => norm(d.name)),
        );
        const free = POOL.filter((n) => !takenOnline.has(n));
        const pick = free.length ? free : POOL;
        return pick[Math.floor(Math.random() * pick.length)];
    }

    /** Register or refresh a device (web client reports itself on connect/resize). */
    static async register(input: RegisterInput): Promise<Device> {
        const t = getLux().table('devices');
        const all = (unwrap(await t.select()) as Devices[]).map(
            (r) => new Device(r as unknown as DeviceData),
        );
        const existing = all.find((d) => d.id === input.id);
        const body = {
            id: input.id,
            name: Device.assignName(input.id, input.requestedName, all, existing),
            kind: input.kind ?? 'web',
            screen_w: input.screen_w,
            screen_h: input.screen_h,
            connected: true,
            last_seen: Date.now(),
        };
        if (existing) unwrap(await t.update(body as never).eq('id', input.id));
        else unwrap(await t.insert(body as never));
        return new Device(body as DeviceData);
    }

    static async heartbeat(id: string): Promise<void> {
        unwrap(
            await getLux()
                .table('devices')
                .update({ last_seen: Date.now(), connected: true } as never)
                .eq('id', id),
        );
    }

    static async setConnected(id: string, connected: boolean): Promise<void> {
        await Device.update(id, { connected });
    }

    static async listAll(): Promise<Device[]> {
        const rows = unwrap(
            await getLux().table('devices').select().order('last_seen', { ascending: false }),
        ) as Devices[];
        return rows.map((r) => new Device(r as unknown as DeviceData));
    }

    static async listOnline(): Promise<Device[]> {
        const cutoff = Date.now() - ONLINE_WINDOW_MS;
        return (await Device.listAll()).filter((d) => d.last_seen >= cutoff);
    }
}
