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
import { SecretsUtility } from '../secrets/tool';
import { AskUtility } from '../ask/tool';
import { NotifyUtility } from '../mediums/tool';
import { BrowserOpenUtility } from '../browser/tool';
import { BrowserAgentUtility } from '../browser/agent-tool';
import { ProjectUtility } from '../projects/tool';

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
        loadUtilities(new SecretsUtility()),
        loadUtilities(new AskUtility()),
        loadUtilities(new NotifyUtility()),
        loadUtilities(new BrowserOpenUtility()),
        loadUtilities(new BrowserAgentUtility()),
        loadUtilities(new ProjectUtility()),
    ];
    if (cfg.tavilyApiKey) utils.push(loadUtilities(new WebUtility(cfg.tavilyApiKey)));
    if (opts.includeMcp ?? true) utils.push(mcpUtilities());
    return utils;
}

/** A focused tool set for project worker agents: act on the world (web, files,
 *  shell, browser, memory) but NOT the orchestration tools — no display/ask/notify,
 *  no spawning sub-projects, no MCP bloat. */
export function buildWorkerUtilities(): MagmaUtilities[] {
    const cfg = loadConfig();
    const utils: MagmaUtilities[] = [
        loadUtilities(new MemoryUtility()),
        loadUtilities(new FileUtility()),
        loadUtilities(new BashUtility()),
        loadUtilities(new BrowserOpenUtility()),
        loadUtilities(new BrowserAgentUtility()),
    ];
    if (cfg.tavilyApiKey) utils.push(loadUtilities(new WebUtility(cfg.tavilyApiKey)));
    return utils;
}
