import { tool, toolparam } from '@pompeii-labs/magma/decorators';
import type { MagmaToolCall } from '@pompeii-labs/magma/types';
import type { MagmaAgent } from '@pompeii-labs/magma';
import { McpConnect } from './connect';
import { getMcpClient } from './client';
import { McpConnection } from '../models/mcp-connection';

/** Chat-native integration management: connect an MCP server (OAuth or API key),
 *  list connected integrations + their tools, disconnect. */
export class McpConnectUtility {
    @tool({
        name: 'connect_integration',
        description:
            'Connect an external integration (MCP server) so you gain its tools. For OAuth servers this returns a link the user must click to authorize; share that link with them. Known: Lux (https://api.luxdb.dev/mcp), GitHub, Google. Pass api_key only if the user provides one.',
    })
    @toolparam({
        key: 'name',
        type: 'string',
        required: true,
        description: 'Short id for the integration, e.g. "lux", "github".',
    })
    @toolparam({ key: 'url', type: 'string', required: true, description: 'The MCP server URL.' })
    @toolparam({
        key: 'api_key',
        type: 'string',
        required: false,
        description: 'A direct API token, if the user supplies one instead of OAuth.',
    })
    async connect_integration(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const name = String(call.fn_args.name ?? '').trim();
        const url = String(call.fn_args.url ?? '').trim();
        if (!name || !url) return 'name and url are required.';
        const apiKey = call.fn_args.api_key ? String(call.fn_args.api_key) : undefined;
        const r = await McpConnect.start({ name, url, apiKey });
        if (r.status === 'auth_required') {
            return `${name} needs authorization. Send the user this link to approve, then it'll connect automatically:\n${r.authUrl}`;
        }
        return r.message;
    }

    @tool({
        name: 'list_integrations',
        description:
            'List configured integrations and which are currently connected, with their tool counts.',
    })
    async list_integrations(_call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        const conns = await McpConnection.listAll();
        if (conns.length === 0) return 'No integrations configured yet.';
        const client = getMcpClient();
        return conns
            .map((c) => {
                const connected = client.isConnected(c.name);
                const tools = client.getTools().filter((t) => t.server === c.name).length;
                return `- ${c.name} (${c.url ?? c.transport}) — ${connected ? `connected, ${tools} tools` : 'not connected'}`;
            })
            .join('\n');
    }

    @tool({
        name: 'disconnect_integration',
        description: 'Disconnect and forget an integration.',
    })
    @toolparam({
        key: 'name',
        type: 'string',
        required: true,
        description: 'The integration id to remove.',
    })
    async disconnect_integration(call: MagmaToolCall, _agent?: MagmaAgent): Promise<string> {
        return McpConnect.disconnect(String(call.fn_args.name ?? '').trim());
    }
}
