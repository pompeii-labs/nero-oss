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
    name: string;
    kind?: string;
    screenW: number;
    screenH: number;
}

/** Register or refresh a device (web client reports itself on connect/resize). */
export async function register(input: RegisterInput): Promise<Device> {
    const t = getLux().table('devices');
    const existing = unwrap(await t.select().eq('id', input.id).limit(1)) as Devices[];
    const body = {
        id: input.id,
        name: input.name,
        kind: input.kind ?? 'web',
        screen_w: input.screenW,
        screen_h: input.screenH,
        connected: true,
        last_seen: Date.now(),
    };
    if (existing.length) unwrap(await t.update(body as never).eq('id', input.id));
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
