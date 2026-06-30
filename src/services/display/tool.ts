import { tool, toolparam } from '@pompeii-labs/magma/decorators';
import type { MagmaToolCall } from '@pompeii-labs/magma/types';
import type { MagmaAgent } from '@pompeii-labs/magma';
import { Device } from '../../models/device';
import { Presence } from '../../models/presence';
import { Panel, type PanelFn, type PanelData } from '../../models/panel';
import { Args } from '../../util/args';

const PANEL_SCHEMA = `Components is a JSON array of nodes. Node types:
- {"type":"text","text":"...","variant":"title|heading|body|caption|mono"}
- {"type":"button","label":"...","variant":"primary|default|ghost|danger","action":<ACTION>}
- {"type":"image","src":"https://...","alt":"...","height":160,"fit":"cover|contain"}
- {"type":"youtube","videoId":"<11-char id>","start":0} -> embeds a video. Autoplays by default (add "autoplay":false to stop that). The user gets native play/pause/seek/fullscreen. To control it YOURSELF, update_panel its state with a "yt" command: {"do":"play|pause|seek|mute|unmute","to":<seconds for seek>}, e.g. update_panel state {"yt":{"do":"pause"}} or {"yt":{"do":"seek","to":90}}. Give the panel a wide w (480+) for video.
- {"type":"metric","label":"...","value":"...","sub":"..."}
- {"type":"chart","value":{"bind":"btc"},"kind":"line|area|bar","height":60} -> a live sparkline. Bind "value" to the SAME state key as the number you're displaying (a metric's value; a formatted string like "$60,894" or "42%" is fine, it's parsed). It records each update into a rolling line over time on its own. You do NOT need to create or fill a separate series array. Only use "data":[numbers] / {"bind":"key"} when your function already returns a full array of numbers. Optional "window" (points kept, default 40), "min"/"max".
- {"type":"progress","label":"...","value":42,"max":100}
- {"type":"list","items":["...","..."],"ordered":false}
- {"type":"badge","text":"...","tone":"info|good|warn|bad"}
- {"type":"divider"}
- {"type":"row","children":[...],"gap":10,"align":"center"}  (horizontal)
- {"type":"stack","children":[...],"gap":12}                  (vertical)

Button ACTION is one of:
- {"type":"interact","intent":"what this press means to you"} -> arrives back as a labeled interaction event (drives a response from you). Use for decisions/conversation.
- {"type":"call","fn":"<functionName>"} -> runs one of this panel's named functions server-side and patches the panel's data. NO response from you. Use for refresh/fetch/toggle.

LIVE DATA: any field value can be {"bind":"stateKey"} instead of a literal, to show live panel state, e.g. {"type":"metric","label":"CPU","value":{"bind":"cpu"}}. Provide initial values via the state object.

FUNCTIONS (the panel's little API) is a JSON object of name -> a function spec. Each runs server-side and patches the panel's state: a returned JSON object is merged into state (so bind components to those keys), or with "into" the raw result goes to state[into]. Three kinds:
- {"kind":"shell","cmd":"<bash>"} -> runs a command; parses stdout.
- {"kind":"http","url":"https://...","method":"GET","headers":{...}} -> fetches a URL; parses the JSON response.
- {"kind":"js","code":"const r = await fetch(url); const d = await r.json(); return { temp: d.temp };"} -> your own async JS. "fetch" and "secrets" are in scope; return an object to merge into state. This is how you write real integrations.
LIVE / AUTO-REFRESH: add "everyMs": <ms> (>=1000) to any function and it re-runs on that interval on its own while the panel is open — no button needed. This is how you build self-updating dashboards (e.g. poll system stats every 2000ms and feed a chart).
SECRETS: never hardcode API keys. Reference the user's secret pool by name: secrets.NAME in js, \${NAME} in http url/headers/body, $NAME in shell. Call list_secrets to see what's available; if you need one that isn't set, call request_secret to stage it and tell the user.
Example: functions {"sys":{"kind":"shell","cmd":"echo '{\\"cpu\\":42}'","everyMs":2000}}, with a metric bound to {"bind":"cpu"} and a chart {"value":{"bind":"cpu"}}.

Panels are draggable and dismissable by the user; geometry stays in sync and you can read it with list_panels.`;

async function resolveDevice(ref: string): Promise<Device | null> {
    const t = ref.trim();
    const ds = await Device.listOnline();
    if (!t) {
        const here = await Presence.get();
        return ds.find((d) => d.id === here) ?? null;
    }
    return ds.find((d) => d.id === t || d.name.toLowerCase() === t.toLowerCase()) ?? null;
}

/** Nero's awareness of and control over where he physically is. The orb is a
 *  single entity that lives on one screen at a time; these let him see the
 *  screens on the network and move himself between them. Panel tools (throwing
 *  interfaces) come alongside these. */
export class DisplayUtility {
    @tool({
        name: 'list_devices',
        description:
            'List the screens on the network you can move to or throw panels onto: their names, ids, sizes, online status, and which one you are currently on.',
    })
    async list_devices(_call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const ds = await Device.listOnline();
        if (!ds.length) return 'No devices connected right now.';
        const here = await Presence.get();
        const lines = ds.map(
            (d) =>
                `${d.id === here ? '> ' : '  '}${d.name} [${d.id}] ${d.screen_w}x${d.screen_h} ${d.connected ? 'online' : 'offline'}`,
        );
        return `${lines.join('\n')}\n(> = where you are now)`;
    }

    @tool({
        name: 'move_to',
        description:
            'Move yourself (the orb) to a different screen. You can only be in one place at a time. Use list_devices first if unsure of names.',
    })
    @toolparam({
        key: 'device',
        type: 'string',
        required: true,
        description: 'The device id or name to move to.',
    })
    async move_to(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const args = new Args(call);
        const target = args.text('device');
        const ds = await Device.listOnline();
        const match = ds.find(
            (d) => d.id === target || d.name.toLowerCase() === target.toLowerCase(),
        );
        if (!match) return `No device matching "${target}". Use list_devices to see options.`;
        await Presence.set(match.id);
        return `Moved to ${match.name}.`;
    }

    @tool({
        name: 'create_panel',
        description: `Throw an interactive panel onto a screen, a dashboard, controls, a graph, media, status, anything you want to show. Defaults to the screen you're on. ${PANEL_SCHEMA}`,
    })
    @toolparam({ key: 'title', type: 'string', required: true, description: 'Panel header.' })
    @toolparam({
        key: 'components',
        type: 'string',
        required: true,
        description: 'JSON array of component nodes (see schema).',
    })
    @toolparam({
        key: 'device',
        type: 'string',
        required: false,
        description: 'Target screen id or name. Defaults to where you are.',
    })
    @toolparam({ key: 'x', type: 'number', required: false, description: 'Left px (default 40).' })
    @toolparam({ key: 'y', type: 'number', required: false, description: 'Top px (default 40).' })
    @toolparam({
        key: 'w',
        type: 'number',
        required: false,
        description: 'Width px (default 380).',
    })
    @toolparam({ key: 'h', type: 'number', required: false, description: 'Max height px.' })
    @toolparam({
        key: 'state',
        type: 'string',
        required: false,
        description: 'JSON object of initial values for bound fields.',
    })
    @toolparam({
        key: 'functions',
        type: 'string',
        required: false,
        description: 'JSON object of name -> {kind:"shell",cmd,into?} for call-buttons.',
    })
    async create_panel(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const a = call.fn_args;
        const args = new Args(call);
        let components: unknown[];
        try {
            components = JSON.parse(args.str('components', '[]'));
        } catch {
            return 'components must be valid JSON.';
        }
        if (!Array.isArray(components)) return 'components must be a JSON array.';
        let state: Record<string, unknown> | undefined;
        let functions: Record<string, PanelFn> | undefined;
        try {
            if (a.state != null) state = JSON.parse(args.str('state'));
            if (a.functions != null) functions = JSON.parse(args.str('functions'));
        } catch {
            return 'state/functions must be valid JSON.';
        }
        const device = await resolveDevice(args.str('device'));
        if (!device) return 'No target screen. Run list_devices, or move somewhere first.';
        const p = await Panel.open({
            device_id: device.id,
            title: args.str('title', 'Panel'),
            components,
            state,
            functions,
            x: a.x != null ? args.num('x') : undefined,
            y: a.y != null ? args.num('y') : undefined,
            w: a.w != null ? args.num('w') : undefined,
            h: a.h != null ? args.num('h') : undefined,
        });
        return `Panel "${p.title}" opened on ${device.name} (id ${p.id}).`;
    }

    @tool({
        name: 'update_panel',
        description:
            'Update an open panel: re-render its components, rename it, resize or reposition it, move it to another screen, or maximize it. Only pass what changes. To make a panel fill the screen (the user may say "fullscreen it" or "make it big"), set maximized true; set it false to shrink back to its x/y/w/h.',
    })
    @toolparam({ key: 'id', type: 'string', required: true, description: 'Panel id.' })
    @toolparam({ key: 'title', type: 'string', required: false })
    @toolparam({
        key: 'components',
        type: 'string',
        required: false,
        description: 'New JSON component array (replaces the tree).',
    })
    @toolparam({
        key: 'device',
        type: 'string',
        required: false,
        description: 'Move the panel to this screen.',
    })
    @toolparam({ key: 'x', type: 'number', required: false })
    @toolparam({ key: 'y', type: 'number', required: false })
    @toolparam({ key: 'w', type: 'number', required: false })
    @toolparam({ key: 'h', type: 'number', required: false })
    @toolparam({ key: 'state', type: 'string', required: false, description: 'JSON state patch.' })
    @toolparam({
        key: 'functions',
        type: 'string',
        required: false,
        description: 'JSON functions map (replaces).',
    })
    @toolparam({
        key: 'maximized',
        type: 'boolean',
        required: false,
        description: 'true = fill the screen; false = restore to x/y/w/h.',
    })
    async update_panel(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const a = call.fn_args;
        const args = new Args(call);
        const id = args.str('id');
        const existing = await Panel.get(id);
        if (!existing) return `No panel ${id}.`;
        const patch: Partial<PanelData> = {};
        if (a.title != null) patch.title = args.str('title');
        if (a.x != null) patch.x = args.num('x');
        if (a.y != null) patch.y = args.num('y');
        if (a.w != null) patch.w = args.num('w');
        if (a.h != null) patch.h = args.num('h');
        if (a.maximized != null) patch.maximized = args.bool('maximized');
        try {
            if (a.state != null)
                patch.state = { ...existing.state, ...JSON.parse(args.str('state')) };
            if (a.functions != null) patch.functions = JSON.parse(args.str('functions'));
        } catch {
            return 'state/functions must be valid JSON.';
        }
        if (a.components != null) {
            try {
                const c = JSON.parse(args.str('components'));
                if (!Array.isArray(c)) return 'components must be a JSON array.';
                patch.components = c;
            } catch {
                return 'components must be valid JSON.';
            }
        }
        if (a.device != null) {
            const d = await resolveDevice(args.str('device'));
            if (!d) return `No screen matching "${a.device}".`;
            patch.device_id = d.id;
        }
        await Panel.update(id, patch);
        return 'Panel updated.';
    }

    @tool({ name: 'close_panel', description: 'Close (remove) an open panel.' })
    @toolparam({ key: 'id', type: 'string', required: true, description: 'Panel id.' })
    async close_panel(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const args = new Args(call);
        const id = args.str('id');
        if (!(await Panel.get(id))) return `No panel ${id}.`;
        await Panel.close(id);
        return 'Closed.';
    }

    @tool({
        name: 'list_panels',
        description:
            'List the panels currently open, with their ids, titles, screens, and geometry.',
    })
    async list_panels(_call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const open = await Panel.listOpen();
        if (!open.length) return 'No panels open.';
        const ds = await Device.listOnline();
        const nameOf = (id: string | null) => ds.find((d) => d.id === id)?.name ?? id ?? '?';
        return open
            .map(
                (p) =>
                    `${p.id} "${p.title}" on ${nameOf(p.device_id)} at ${p.x},${p.y} ${p.w}x${p.h}${p.maximized ? ' [maximized]' : ''}`,
            )
            .join('\n');
    }
}
