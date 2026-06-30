import { DataModel } from './datamodel';
import { getLux, unwrap } from '../lib/lux';
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

export interface PanelData {
    id: string;
    device_id: string | null;
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
    created_at: number;
    updated_at: number;
}

export interface OpenPanelInput {
    device_id: string;
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

/** A live interface Nero has thrown onto a device's screen. `components` is the
 *  component tree; `state` is the live reactive state. Geometry is absolute. */
export class Panel extends DataModel<PanelData> {
    static readonly tableName = 'panels';
    static readonly stampUpdatedAt = true;

    device_id!: string | null;
    title!: string;
    x!: number;
    y!: number;
    w!: number;
    h!: number;
    z!: number;
    components!: unknown[];
    state!: Record<string, unknown>;
    functions!: Record<string, PanelFn>;
    status!: string;
    maximized!: boolean;
    created_at!: number;
    updated_at!: number;

    constructor(data: PanelData) {
        super();
        Object.assign(this, data);
    }

    static open(input: OpenPanelInput): Promise<Panel> {
        return Panel.create({
            device_id: input.device_id,
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
        });
    }

    /** Open panels on a device, for the spatial picture Nero reads and the web renders. */
    static async listOpen(deviceId?: string): Promise<Panel[]> {
        let q = getLux().table('panels').select().eq('status', 'open');
        if (deviceId) q = q.eq('device_id', deviceId);
        const rows = unwrap(await q.order('z', { ascending: true })) as Panels[];
        return rows.map((r) => new Panel(r as unknown as PanelData));
    }

    static close(id: string): Promise<void> {
        return Panel.update(id, { status: 'closed' });
    }
}
