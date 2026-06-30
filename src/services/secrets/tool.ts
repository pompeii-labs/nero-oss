import { tool, toolparam } from '@pompeii-labs/magma/decorators';
import type { MagmaToolCall } from '@pompeii-labs/magma/types';
import type { MagmaAgent } from '@pompeii-labs/magma';
import { Secret } from '../../models/secret';
import { Args } from '../../util/args';

/** Nero's awareness of the secret pool. He can see what's available and stage the
 *  ones he needs, but never reads a value: secrets are injected into panel
 *  functions at run time (secrets.NAME in js, ${NAME} in http, $NAME in shell). */
export class SecretsUtility {
    @tool({
        name: 'list_secrets',
        description:
            'List the secrets available to your panel functions (names and notes only, never the values). Use this before writing a function that needs an API key, so you reference the right name. Names you can use in functions as secrets.NAME (js), ${NAME} (http), or $NAME (shell).',
    })
    async list_secrets(_call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const all = await Secret.listMeta();
        if (!all.length) return 'No secrets set yet. Use request_secret to ask the user for one.';
        return all
            .map(
                (s) =>
                    `${s.key}${s.isPlaceholder ? ' (NOT SET - staged, waiting on the user)' : ' (set)'}${
                        s.description ? ` - ${s.description}` : ''
                    }`,
            )
            .join('\n');
    }

    @tool({
        name: 'request_secret',
        description:
            "Stage a secret you need but don't have, so the user can fill it in. Creates a named placeholder with your note on what it is and where to get it. After calling this, tell the user in plain language that you need them to set it. Use UPPER_SNAKE_CASE names (e.g. OPENWEATHER_API_KEY).",
    })
    @toolparam({
        key: 'key',
        type: 'string',
        required: true,
        description: 'Secret name in UPPER_SNAKE_CASE, e.g. OPENWEATHER_API_KEY.',
    })
    @toolparam({
        key: 'description',
        type: 'string',
        required: true,
        description: 'What this secret is and where the user can get it.',
    })
    async request_secret(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const a = new Args(call);
        const key = a
            .text('key')
            .toUpperCase()
            .replace(/[^A-Z0-9_]/g, '_');
        const description = a.text('description');
        if (!key) return 'Provide a key name.';
        const r = await Secret.stage(key, description);
        return r === 'exists'
            ? `${key} already exists. Ask the user to set its value if it isn't yet.`
            : `Staged ${key}. Now tell the user you need them to set it: they can set it in the Workshop or via the secrets endpoint.`;
    }
}
