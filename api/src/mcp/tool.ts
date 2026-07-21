import { tool, toolparam } from '@pompeii-labs/magma/decorators';
import type { MagmaToolCall } from '@pompeii-labs/magma/types';
import type { MagmaAgent } from '@pompeii-labs/magma';
import { CATALOG, getIntegration, missingSecrets } from './catalog';
import { integrationStatus } from './reconcile';
import { startAuth } from './oauth';
import { Args } from '../util/args';

/** Nero's awareness of his built-in integrations (the "skill tree"): what he can do,
 *  what's missing, and how to switch one on. */
export class IntegrationsUtility {
    @tool({
        name: 'list_integrations',
        description:
            "List Nero's built-in integrations and their status: needs-secret (missing API credentials the user must set), needs-auth (secrets set, the user just needs to authorize), or connected. Use this to know what you can do and what setup a request needs.",
    })
    async list_integrations(_call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const lines = await Promise.all(
            CATALOG.map(async (i) => {
                const status = await integrationStatus(i);
                const extra =
                    status === 'needs-secret'
                        ? ` (set these secrets: ${(await missingSecrets(i)).join(', ')})`
                        : '';
                return `- ${i.id} [${status}]${extra}: ${i.description}`;
            }),
        );
        return lines.length ? lines.join('\n') : 'No built-in integrations.';
    }

    @tool({
        name: 'authorize_integration',
        description:
            "Get an OAuth link to connect a built-in integration (e.g. google). Give the link to the user to open in their browser; once they approve, it connects automatically. The integration's secrets must be set first (see list_integrations).",
    })
    @toolparam({
        key: 'id',
        type: 'string',
        required: true,
        description: 'The integration id, e.g. "google". See list_integrations.',
    })
    async authorize_integration(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const id = new Args(call).str('id');
        if (!getIntegration(id))
            return `No integration "${id}". Use list_integrations to see options.`;
        const r = await startAuth(id);
        return r.ok && r.authUrl
            ? `Have the user open this link to connect ${id}: ${r.authUrl}`
            : r.message;
    }
}
