import type { ActionProvider, ActionTemplate } from '../catalog';

/**
 * The escape hatch. Without these the catalogue is a fixed list; with them any API
 * or local command is one action away, and Nero's authoring loop has something to
 * start from when nothing in the catalogue fits.
 */

const provider: ActionProvider = {
    id: 'generic',
    name: 'Anything',
    description: 'Point an action at any HTTP endpoint or shell command.',
    requiredSecrets: [],
    secretHints: {},
};

const templates: ActionTemplate[] = [
    {
        id: 'generic.http',
        provider: 'generic',
        label: 'Request',
        icon: 'globe',
        description:
            'One HTTP request. Reference a vault secret anywhere in the url, headers or body as ${NAME} and it resolves at run time, never stored.',
        kind: 'http',
        requiredSecrets: [],
        params: [
            {
                key: 'method',
                label: 'Method',
                description: 'HTTP method.',
                default: 'POST',
                options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
                required: true,
            },
            { key: 'url', label: 'URL', description: 'Full URL.', required: true },
            {
                key: 'body',
                label: 'Body',
                description: 'Request body, usually JSON. Leave empty for GET.',
                default: '',
            },
        ],
        fn: {
            kind: 'http',
            method: '{{method}}',
            url: '{{url}}',
            headers: { 'Content-Type': 'application/json' },
            body: '{{body}}',
        },
    },
    {
        id: 'generic.shell',
        provider: 'generic',
        label: 'Command',
        icon: 'terminal',
        description:
            'One shell command, run through the runner with the vault in its environment ($NAME). For local devices and CLI tools that have no cloud API.',
        kind: 'shell',
        requiredSecrets: [],
        params: [
            {
                key: 'cmd',
                label: 'Command',
                description: 'The command to run.',
                required: true,
            },
        ],
        fn: { kind: 'shell', cmd: '{{cmd}}' },
    },
];

export const GENERIC = { providers: [provider], templates };
