import type { ActionProvider, ActionTemplate } from '../catalog';

/**
 * LIFX, over the cloud HTTP API. Deliberately not through MCP: an MCP call needs a
 * full LLM turn, and a light switch that takes five seconds isn't a light switch.
 * These fire straight from a dial press.
 *
 * API shapes verified against api.developer.lifx.com:
 *   PUT  /v1/lights/{selector}/state    power|color|brightness|duration  -> 202
 *   POST /v1/lights/{selector}/toggle   duration                         -> 207
 *   PUT  /v1/scenes/scene_id:{uuid}/activate
 * `fast` is left off on purpose: it skips confirmation, which is faster but tells
 * the authoring loop nothing about whether the call actually worked.
 */

const BASE = 'https://api.lifx.com/v1';
const AUTH = { Authorization: 'Bearer ${LIFX_API_KEY}', 'Content-Type': 'application/json' };

/** Every LIFX action takes one. `all` is the safe default; a label or group is what
 *  you actually want on a dial. */
const SELECTOR = {
    key: 'selector',
    label: 'Lights',
    description:
        'Which lights: "all", "label:Kitchen", "group:Bedroom", "id:d073d5..." or a comma-separated list of up to 25.',
    default: 'all',
    required: true,
};

const DURATION = {
    key: 'duration',
    label: 'Fade',
    description: 'Seconds to fade over. 0 is instant.',
    default: '1',
};

const provider: ActionProvider = {
    id: 'lifx',
    name: 'LIFX',
    description: 'Control LIFX bulbs, strips and panels directly over the cloud API.',
    requiredSecrets: ['LIFX_API_KEY'],
    secretHints: {
        LIFX_API_KEY:
            'A personal access token from cloud.lifx.com/settings. Account-level, so it survives re-onboarding a bulb.',
    },
};

const templates: ActionTemplate[] = [
    {
        id: 'lifx.toggle',
        provider: 'lifx',
        label: 'Lights',
        icon: 'zap',
        description: 'Flip the selected lights on or off, whichever they currently are not.',
        kind: 'http',
        requiredSecrets: ['LIFX_API_KEY'],
        params: [SELECTOR, DURATION],
        fn: {
            kind: 'http',
            method: 'POST',
            url: `${BASE}/lights/{{selector}}/toggle`,
            headers: AUTH,
            body: '{"duration":{{duration}}}',
        },
    },
    {
        id: 'lifx.on',
        provider: 'lifx',
        label: 'Lights On',
        icon: 'zap',
        description: 'Turn the selected lights on, optionally at a set brightness.',
        kind: 'http',
        requiredSecrets: ['LIFX_API_KEY'],
        params: [
            SELECTOR,
            {
                key: 'brightness',
                label: 'Brightness',
                description: '0.0 to 1.0.',
                default: '1.0',
            },
            DURATION,
        ],
        fn: {
            kind: 'http',
            method: 'PUT',
            url: `${BASE}/lights/{{selector}}/state`,
            headers: AUTH,
            body: '{"power":"on","brightness":{{brightness}},"duration":{{duration}}}',
        },
    },
    {
        id: 'lifx.off',
        provider: 'lifx',
        label: 'Lights Off',
        icon: 'moon',
        description: 'Turn the selected lights off.',
        kind: 'http',
        requiredSecrets: ['LIFX_API_KEY'],
        params: [SELECTOR, DURATION],
        fn: {
            kind: 'http',
            method: 'PUT',
            url: `${BASE}/lights/{{selector}}/state`,
            headers: AUTH,
            body: '{"power":"off","duration":{{duration}}}',
        },
    },
    {
        id: 'lifx.brightness',
        provider: 'lifx',
        label: 'Dim',
        icon: 'zap',
        description: 'Set the selected lights to a specific brightness, turning them on.',
        kind: 'http',
        requiredSecrets: ['LIFX_API_KEY'],
        params: [
            SELECTOR,
            {
                key: 'brightness',
                label: 'Brightness',
                description: '0.0 to 1.0.',
                default: '0.3',
                required: true,
            },
            DURATION,
        ],
        fn: {
            kind: 'http',
            method: 'PUT',
            url: `${BASE}/lights/{{selector}}/state`,
            headers: AUTH,
            body: '{"power":"on","brightness":{{brightness}},"duration":{{duration}}}',
        },
    },
    {
        id: 'lifx.color',
        provider: 'lifx',
        label: 'Colour',
        icon: 'zap',
        description:
            'Set the selected lights to a colour. Accepts names ("red"), hex ("#ff0000"), "kelvin:2700", or "hue:120 saturation:0.8".',
        kind: 'http',
        requiredSecrets: ['LIFX_API_KEY'],
        params: [
            SELECTOR,
            {
                key: 'color',
                label: 'Colour',
                description: 'A LIFX colour string, e.g. "red", "#ff8800", "kelvin:2700".',
                default: 'warm white',
                required: true,
            },
            DURATION,
        ],
        fn: {
            kind: 'http',
            method: 'PUT',
            url: `${BASE}/lights/{{selector}}/state`,
            headers: AUTH,
            body: '{"power":"on","color":"{{color}}","duration":{{duration}}}',
        },
    },
    {
        id: 'lifx.scene',
        provider: 'lifx',
        label: 'Scene',
        icon: 'play',
        description: 'Activate a saved LIFX scene by its id.',
        kind: 'http',
        requiredSecrets: ['LIFX_API_KEY'],
        params: [
            {
                key: 'scene_id',
                label: 'Scene',
                description: 'The scene UUID. List them with GET /v1/scenes if you do not know it.',
                required: true,
            },
            DURATION,
        ],
        fn: {
            kind: 'http',
            method: 'PUT',
            url: `${BASE}/scenes/scene_id:{{scene_id}}/activate`,
            headers: AUTH,
            body: '{"duration":{{duration}}}',
        },
    },
];

export const LIFX = { providers: [provider], templates };
