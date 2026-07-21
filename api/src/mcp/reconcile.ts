import { CATALOG, secretsSatisfied, type Integration, type IntegrationStatus } from './catalog';
import { McpConnection } from '../models/mcp-connection';
import { getMcpClient } from '../services/mcp/client';

/**
 * Ensure each built-in integration has an `mcp_connection` iff its required secrets are
 * present. Runs on boot (before connectAll) and whenever a required secret changes.
 * Only manages connections it owns (config.integration set), so a user's hand-added
 * server of the same name is left alone until it's migrated to the built-in.
 */
export async function reconcileIntegrations(opts: { connect?: boolean } = {}): Promise<void> {
    for (const integ of CATALOG) {
        const existing = await McpConnection.getByName(integ.id);
        const isBuiltin = existing?.config?.integration === integ.id;
        const ok = await secretsSatisfied(integ);

        if (ok && !isBuiltin) {
            await McpConnection.upsert({
                name: integ.id,
                transport: 'stdio',
                config: {
                    command: integ.server.command,
                    args: integ.server.args,
                    integration: integ.id,
                },
                disabled: false,
            });
            if (opts.connect) {
                const conn = await McpConnection.getByName(integ.id);
                if (conn)
                    await getMcpClient()
                        .connectOne(conn)
                        .catch(() => {});
            }
        } else if (!ok && isBuiltin) {
            // Secrets removed: drop the built-in connection.
            await getMcpClient()
                .disconnect(integ.id)
                .catch(() => {});
            await McpConnection.removeByName(integ.id);
        }
    }
}

/** needs-secret (missing client secrets) | needs-auth (no tokens yet) | connected. */
export async function integrationStatus(integ: Integration): Promise<IntegrationStatus> {
    if (!(await secretsSatisfied(integ))) return 'needs-secret';
    const conn = await McpConnection.getByName(integ.id);
    if (!conn?.auth?.integrationTokens) return 'needs-auth';
    return 'connected';
}
