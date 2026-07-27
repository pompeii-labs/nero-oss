import type { ActionProvider, ActionTemplate } from '../catalog';

/**
 * Actions that need nothing configured. They matter because they work on a fresh
 * install with an empty vault, so the dial is useful before you've set up a single
 * integration.
 *
 * These assume rather than interrogate. A button that opens by asking you to specify
 * it is ceremony; the point is that Nero works out what's useful from what he can
 * already see. The interview path stays available for an agent action created with no
 * goal at all, as a fallback rather than a default.
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
            "What matters right now. Takes stock of what he can actually reach, what you've been working on, and what changed, then leads with the part you'd want first.",
        kind: 'agent',
        requiredSecrets: [],
        params: [],
        // No interview. Asking someone to specify their own briefing is ceremony; the
        // whole point is that he works out what's useful from what he can see.
        body: `Give me a brief on what actually matters right now.

Work it out, don't ask me. Before you report anything:
- Take stock of what you can reach. Check which integrations and MCP servers are connected and use them; don't speculate about things you could have just looked up.
- Read back over our recent conversation and your memories of me for what I'm actually in the middle of, what I've been worrying at, and what I asked you to keep an eye on.
- Then go and check the things that move: today's calendar and anything about to collide, genuinely time-sensitive mail (not newsletters), the state of anything you're running for me in the background, and anything you flagged earlier that I never came back to.

Then write it:
- Lead with the thing I'd want to know first, not a preamble.
- Be specific. "Two PRs waiting on you since Thursday" beats "some things need attention".
- Cut anything I'd skip. If it's a quiet morning, say so in a line rather than padding it out.
- Flag anything that looks wrong or unusual even if I didn't ask about it.
- Short, plain, no headings unless there's genuinely a lot.`,
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
