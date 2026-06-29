import { getLux, unwrap } from '../lux/client';
import type { Panels } from '../lux/types';

/** A named, server-side function Nero attaches to a panel. A `call`-button runs it
 *  (no LLM turn) and its output patches the panel's state; a function with `everyMs`
 *  also auto-runs on that interval while the panel is on screen (live dashboards).
 *  If `into` is set the output lands at state[into]; otherwise a JSON object is
 *  merged into state. Three kinds: shell command, http fetch, or Nero-authored js. */
export type PanelFn =
    | { kind: 'shell'; cmd: string; into?: string; everyMs?: number }
    | {
          kind: 'http';
          url: string;
          method?: string;
          headers?: Record<string, string>;
          body?: string;
          into?: string;
          everyMs?: number;
      }
    | { kind: 'js'; code: string; into?: string; everyMs?: number };

/** A live interface Nero has thrown onto a device's screen. `components` is the
 *  component tree; `state` is the live reactive state. Geometry is absolute. */
export interface Panel {
    id: string;
    deviceId: string | null;
    title: string;
    x: number;
    y: number;
    w: number;
    h: number;
    z: number;
    components: unknown[];
    state: Record<string, unknown>;
    functions: Record<string, PanelFn>;
    status: string;
    maximized: boolean;
}

function coerce(r: Panels): Panel {
    return {
        id: r.id,
        deviceId: r.device_id,
        title: r.title ?? '',
        x: r.x ?? 0,
        y: r.y ?? 0,
        w: r.w ?? 380,
        h: r.h ?? 300,
        z: r.z ?? 0,
        components: (r.components as unknown[]) ?? [],
        state: (r.state as Record<string, unknown>) ?? {},
        functions: (r.functions as Record<string, PanelFn>) ?? {},
        status: r.status ?? 'open',
        maximized: r.maximized ?? false,
    };
}

export interface CreateInput {
    deviceId: string;
    title: string;
    components: unknown[];
    state?: Record<string, unknown>;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    z?: number;
    functions?: Record<string, PanelFn>;
}

export async function create(input: CreateInput): Promise<Panel> {
    const res = await getLux()
        .table('panels')
        .insert({
            device_id: input.deviceId,
            title: input.title,
            components: input.components,
            state: input.state ?? {},
            functions: input.functions ?? {},
            x: input.x ?? 40,
            y: input.y ?? 40,
            w: input.w ?? 380,
            h: input.h ?? 300,
            z: input.z ?? 0,
            status: 'open',
        } as never);
    return coerce(unwrap(res) as Panels);
}

export type PanelPatch = Partial<
    Pick<
        Panel,
        | 'title'
        | 'x'
        | 'y'
        | 'w'
        | 'h'
        | 'z'
        | 'components'
        | 'state'
        | 'functions'
        | 'status'
        | 'deviceId'
        | 'maximized'
    >
>;

export async function update(id: string, patch: PanelPatch): Promise<void> {
    const body: Record<string, unknown> = { updated_at: Date.now() };
    for (const [k, v] of Object.entries(patch)) {
        body[k === 'deviceId' ? 'device_id' : k] = v;
    }
    unwrap(
        await getLux()
            .table('panels')
            .update(body as never)
            .eq('id', id),
    );
}

export async function get(id: string): Promise<Panel | null> {
    const rows = unwrap(await getLux().table('panels').select().eq('id', id).limit(1)) as Panels[];
    return rows.length ? coerce(rows[0]) : null;
}

/** Open panels on a device, for the spatial picture Nero reads and the web renders. */
export async function listOpen(deviceId?: string): Promise<Panel[]> {
    let q = getLux().table('panels').select().eq('status', 'open');
    if (deviceId) q = q.eq('device_id', deviceId);
    return (unwrap(await q.order('z', { ascending: true })) as Panels[]).map(coerce);
}

export async function close(id: string): Promise<void> {
    await update(id, { status: 'closed' });
}
