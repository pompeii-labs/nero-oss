import { loadUtilities } from '@pompeii-labs/magma';
import type { MagmaUtilities } from '@pompeii-labs/magma/types';
import { loadConfig } from '../config';
import { MemoryUtility } from '../memory/tool';
import { FileUtility } from './files';
import { BashUtility } from './bash';
import { WebUtility } from './web';
import { McpConnectUtility } from '../mcp/tool';
import { mcpUtilities } from '../mcp/bridge';
import { DisplayUtility } from '../display/tool';

export interface BuildUtilitiesOpts {
    /** Bridge every connected MCP server's tools (138+ schemas). Off for voice,
     *  where the schema bloat dominates time-to-first-token. Default on. */
    includeMcp?: boolean;
}

/** Assemble Nero's tool utilities. Memory + files + bash + MCP-connect always;
 *  web only when a Tavily key is configured; plus (by default) any connected MCP
 *  servers' tools (bridged dynamically at construction time). */
export function buildUtilities(opts: BuildUtilitiesOpts = {}): MagmaUtilities[] {
    const cfg = loadConfig();
    const utils: MagmaUtilities[] = [
        loadUtilities(new MemoryUtility()),
        loadUtilities(new FileUtility()),
        loadUtilities(new BashUtility()),
        loadUtilities(new McpConnectUtility()),
        loadUtilities(new DisplayUtility()),
    ];
    if (cfg.tavilyApiKey) utils.push(loadUtilities(new WebUtility(cfg.tavilyApiKey)));
    if (opts.includeMcp ?? true) utils.push(mcpUtilities());
    return utils;
}
