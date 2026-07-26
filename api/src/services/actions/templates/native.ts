import type { ActionProvider, ActionTemplate } from '../catalog';

/**
 * Actions that need nothing configured. They matter because they work on a fresh
 * install with an empty vault, so the dial is useful before you've set up a single
 * integration.
 *
 * `agent` templates carry an `interview`: Nero asks what the button should actually
 * do (through the existing Ask card) and writes `body` from your answer, so BRIEF
 * means your brief rather than a generic one.
 */

const provider: ActionProvider = {
    id: 'native',
    name: 'Nero',
    description: 'Things Nero can do on his own. No API keys, no setup.',
    requiredSecrets: [],
    secretHints: {},
};

const templates: ActionTemplate[] = [
    {
        id: 'native.brief',
        provider: 'native',
        label: 'Brief',
        icon: 'globe',
        description:
            'Your standing brief. Nero asks once what it should cover, then this button runs it as an agent loop: he gathers, checks and reports rather than answering off the top of his head.',
        kind: 'agent',
        requiredSecrets: [],
        params: [],
        interview:
            "Ask what their brief should cover. Probe for what they actually want to know when they press one button in the morning: calendar, unread mail, what you've been working on in the background, markets, weather, deploys, anything they track. Ask what they DON'T want in it too. Then write it as a single instruction to yourself, in second person, concrete enough to run unattended.",
        body: '',
    },
    {
        id: 'native.remember',
        provider: 'native',
        label: 'Remember',
        icon: 'lock',
        description:
            'Commit what was just said to memory, so it survives compaction and shows up in later context.',
        kind: 'prompt',
        requiredSecrets: [],
        params: [],
        body: 'Save the important parts of what we just discussed to memory. Be selective: durable facts, decisions and preferences, not the chatter.',
    },
    {
        id: 'native.project',
        provider: 'native',
        label: 'Project',
        icon: 'terminal',
        description:
            'Hand Nero the thread you are on as a background project he develops over time.',
        kind: 'prompt',
        requiredSecrets: [],
        params: [],
        body: 'Take what we were just talking about and start it as a background project. Pick a clear one-sentence goal and tell me what deliverable to expect.',
    },
    {
        id: 'native.compact',
        provider: 'native',
        label: 'Compact',
        icon: 'refresh',
        description:
            'Fold older history into the running summary. Frees context when a session has got long.',
        kind: 'prompt',
        requiredSecrets: [],
        params: [],
        confirm: true,
        body: '/compact',
    },
];

export const NATIVE = { providers: [provider], templates };
