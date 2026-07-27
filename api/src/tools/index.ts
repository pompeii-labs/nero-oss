import { loadUtilities } from '@pompeii-labs/magma';
import type { MagmaUtilities } from '@pompeii-labs/magma/types';
import { loadConfig } from '@nero/shared/config';
import { MemoryUtility } from '../services/memory/tool';
import { FileUtility } from './files';
import { BashUtility } from './bash';
import { WebUtility } from './web';
import { McpConnectUtility } from '../services/mcp/tool';
import { IntegrationsUtility } from '../mcp/tool';
import { mcpUtilities } from '../services/mcp/bridge';
import { DisplayUtility } from '../services/display/tool';
import { SecretsUtility } from '../services/secrets/tool';
import { AskUtility } from '../services/ask/tool';
import { NotifyUtility } from '../services/mediums/tool';
import { BrowserOpenUtility } from '../services/browser/tool';
import { BrowserAgentUtility } from '../services/browser/agent-tool';
import { ProjectUtility } from '../services/projects/tool';
import { ActionsUtility } from '../services/actions/tool';
import type { DialAuthorUtility } from '../services/actions/author-tool';

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
        loadUtilities(new IntegrationsUtility()),
        loadUtilities(new DisplayUtility()),
        loadUtilities(new SecretsUtility()),
        loadUtilities(new AskUtility()),
        loadUtilities(new NotifyUtility()),
        loadUtilities(new BrowserOpenUtility()),
        loadUtilities(new BrowserAgentUtility()),
        loadUtilities(new ProjectUtility()),
        loadUtilities(new ActionsUtility()),
    ];
    if (cfg.tavilyApiKey) utils.push(loadUtilities(new WebUtility(cfg.tavilyApiKey)));
    if (opts.includeMcp ?? true) utils.push(mcpUtilities());
    return utils;
}

/** A focused tool set for project worker agents: act on the world (web, files,
 *  shell, browser, memory) but NOT the orchestration tools - no display/ask/notify,
 *  no spawning sub-projects, no MCP bloat. */
export function buildWorkerUtilities(baseCwd?: string): MagmaUtilities[] {
    const cfg = loadConfig();
    const utils: MagmaUtilities[] = [
        loadUtilities(new MemoryUtility()),
        loadUtilities(new FileUtility(baseCwd)),
        loadUtilities(new BashUtility(baseCwd)),
        loadUtilities(new BrowserOpenUtility()),
        loadUtilities(new BrowserAgentUtility()),
    ];
    if (cfg.tavilyApiKey) utils.push(loadUtilities(new WebUtility(cfg.tavilyApiKey)));
    return utils;
}

/** Nero authoring a Dial button. Himself, made skinny: his memory and his file/shell
 *  tools so he can read an existing integration and write a proper script, plus the
 *  two that make a button real (test it, save it). No MCP - the point of a Dial action
 *  is that it runs without a model, so wrapping an MCP server would defeat it. */
export function buildAuthorUtilities(author: DialAuthorUtility): MagmaUtilities[] {
    const cfg = loadConfig();
    const utils: MagmaUtilities[] = [
        loadUtilities(new MemoryUtility()),
        loadUtilities(new FileUtility()),
        loadUtilities(new BashUtility()),
        loadUtilities(author),
    ];
    if (cfg.tavilyApiKey) utils.push(loadUtilities(new WebUtility(cfg.tavilyApiKey)));
    return utils;
}
