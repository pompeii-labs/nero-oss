import { DataModel } from './datamodel';
import { getLux, unwrap } from '@nero/shared/lux';
import type { Devices } from '@nero/shared/types';

export interface DeviceData {
    id: string;
    name: string;
    kind: string;
    screen_w: number;
    screen_h: number;
    connected: boolean;
    last_seen: number;
    /** Opted into ambient presence: shows a glanceable orb + listens for the wakeword
     *  even when Nero isn't focused here. */
    ambient: boolean;
    /** Optional room/zone grouping for co-located displays. */
    room: string | null;
}

export interface RegisterInput {
    id: string;
    /** Explicit name request (?name=). Omitted -> the server assigns one. */
    requestedName?: string;
    kind?: string;
    screen_w: number;
    screen_h: number;
}

/** Handheld device kinds. These never compete in wakeword arbitration, can't receive
 *  panels, and Nero won't `move_to` them: a phone is a personal surface you draw him to. */
export const PHONE_KINDS = new Set(['iphone', 'android', 'phone']);

/** Human default name per platform kind. The user renames in Settings. */
const KIND_LABEL: Record<string, string> = {
    mac: 'mac',
    laptop: 'laptop',
    windows: 'windows',
    pc: 'pc',
    linux: 'linux',
    ipad: 'ipad',
    iphone: 'iphone',
    android: 'android',
    phone: 'phone',
    web: 'screen',
};

// The old NATO callsigns + platform junk: a device still carrying one of these is
// treated as "unnamed" so it migrates to a real platform default on its next register.
const CALLSIGNS = [
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
const LEGACY = new Set([...CALLSIGNS, 'tablet', 'device', '']);

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
    ambient!: boolean;
    room!: string | null;

    constructor(data: DeviceData) {
        super();
        Object.assign(this, data);
    }

    /** Decide a device's name: an explicit request wins; an already-named device keeps
     *  its name; otherwise the first desktop screen becomes "main" and everything else
     *  gets a human platform default ("mac", "ipad", "iphone"), deduped with a suffix. */
    private static assignName(
        id: string,
        requested: string | undefined,
        kind: string,
        all: Device[],
        existing: Device | undefined,
    ): string {
        if (requested && requested.trim()) return requested.trim();
        if (existing && !isUnnamed(existing.name)) return existing.name;

        const others = all.filter((d) => d.id !== id);
        const taken = new Set(others.map((d) => norm(d.name)));

        // First desktop screen (not a phone or tablet) becomes "main".
        const handheld = PHONE_KINDS.has(kind) || kind === 'ipad';
        if (!handheld && !taken.has('main')) return 'main';

        const base = KIND_LABEL[kind] ?? 'screen';
        if (!taken.has(base)) return base;
        for (let i = 2; ; i++) {
            const n = `${base}-${i}`;
            if (!taken.has(n)) return n;
        }
    }

    /** Register or refresh a device (web client reports itself on connect/resize). */
    static async register(input: RegisterInput): Promise<Device> {
        const t = getLux().table('devices');
        const all = (unwrap(await t.select()) as Devices[]).map(
            (r) => new Device(r as unknown as DeviceData),
        );
        const existing = all.find((d) => d.id === input.id);
        const kind = input.kind ?? existing?.kind ?? 'web';
        const body = {
            id: input.id,
            name: Device.assignName(input.id, input.requestedName, kind, all, existing),
            kind,
            screen_w: input.screen_w,
            screen_h: input.screen_h,
            connected: true,
            last_seen: Date.now(),
            ambient: existing?.ambient ?? false,
            room: existing?.room ?? null,
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

    /** User-set name (Settings). Sticks across re-registers since it isn't a legacy/default. */
    static async rename(id: string, name: string): Promise<void> {
        await Device.update(id, { name: name.trim() });
    }

    /** Remove a device from the registry. */
    static async forget(id: string): Promise<void> {
        unwrap(await getLux().table('devices').delete().eq('id', id));
    }

    /** Opt a display into (or out of) ambient presence. */
    static async setAmbient(id: string, ambient: boolean, room?: string | null): Promise<void> {
        const patch: Partial<DeviceData> = { ambient };
        if (room !== undefined) patch.room = room;
        await Device.update(id, patch);
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
