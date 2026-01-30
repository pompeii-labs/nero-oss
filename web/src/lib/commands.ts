import { reloadConfig, getHealth, getContext, getUsage, installSlack } from './actions/health';
import { getAllowedTools, revokeAllowedTool } from './actions/settings';
import { getMemories } from './actions/memories';
import { getMcpServers } from './actions/mcp';
import { getSettings, updateSettings, validateModel } from './actions/settings';
import { compactContext, streamThink, abortChat, type ToolActivity } from './actions/chat';

export interface SlashCommand {
    name: string;
    aliases: string[];
    description: string;
    execute: (args: string[], ctx: CommandContext) => Promise<CommandResult>;
}

export interface CommandContext {
    clearMessages: () => void;
    setLoading: (message: string | null) => void;
    log: (message: string) => void;
    navigateTo: (path: string) => void;
    addActivity?: (activity: ToolActivity) => void;
    addAssistantMessage?: (content: string) => void;
}

export type ThinkActivity = {
    tool: string;
    status: 'running' | 'complete' | 'error';
    error?: string;
};

export type CommandWidget =
    | { type: 'context'; data: { tokens: number; limit: number; percentage: number } }
    | { type: 'usage'; data: { limit: number | null; usage: number; remaining: number } }
    | {
          type: 'think';
          data: { activities: ThinkActivity[]; thought: string | null; urgent: boolean };
      };

export interface CommandResult {
    message?: string;
    widget?: CommandWidget;
    error?: string;
    shouldClear?: boolean;
}

export const commands: SlashCommand[] = [
    {
        name: 'help',
        aliases: ['h', '?'],
        description: 'Show available commands',
        execute: async () => {
            const helpText = commands
                .map((cmd) => {
                    const aliases = cmd.aliases.length > 0 ? ` (${cmd.aliases.join(', ')})` : '';
                    return `/${cmd.name}${aliases} - ${cmd.description}`;
                })
                .join('\n');
            return { message: `Available Commands:\n\n${helpText}` };
        },
    },
    {
        name: 'clear',
        aliases: ['c'],
        description: 'Clear current conversation',
        execute: async (args, ctx) => {
            if (!args.includes('--confirm')) {
                return {
                    message:
                        'This will clear your current conversation.\nRun /clear --confirm to proceed.',
                };
            }
            ctx.clearMessages();
            return { message: 'Conversation cleared.', shouldClear: true };
        },
    },
    {
        name: 'reload',
        aliases: ['r'],
        description: 'Reload Nero configuration',
        execute: async (_, ctx) => {
            ctx.setLoading('Reloading configuration');
            const response = await reloadConfig();
            ctx.setLoading(null);
            if (response.success) {
                return {
                    message: `Config reloaded. ${response.data.mcpTools} MCP tools available.`,
                };
            }
            return { error: 'Failed to reload configuration' };
        },
    },
    {
        name: 'memory',
        aliases: ['mem'],
        description: 'Show stored memories',
        execute: async (_, ctx) => {
            ctx.setLoading('Loading memories');
            const response = await getMemories();
            ctx.setLoading(null);
            if (!response.success) {
                return { error: 'Failed to load memories' };
            }
            if (response.data.length === 0) {
                return { message: 'No memories stored yet.' };
            }
            const list = response.data
                .map(
                    (m, i) =>
                        `${i + 1}. ${m.body}\n   ${new Date(m.created_at).toLocaleDateString()}`,
                )
                .join('\n');
            return { message: `Memories:\n\n${list}` };
        },
    },
    {
        name: 'tools',
        aliases: ['t'],
        description: 'List available MCP tools',
        execute: async (_, ctx) => {
            ctx.setLoading('Loading tools');
            const response = await getMcpServers();
            ctx.setLoading(null);
            if (!response.success) {
                return { error: 'Failed to load tools' };
            }
            const tools = response.data.tools;
            if (tools.length === 0) {
                return { message: 'No MCP tools configured. Add servers in the MCP page.' };
            }
            const list = tools.map((t) => `  ${t}`).join('\n');
            return { message: `Available MCP Tools:\n\n${list}` };
        },
    },
    {
        name: 'mcp',
        aliases: [],
        description: 'Show MCP server status',
        execute: async (_, ctx) => {
            ctx.setLoading('Loading MCP status');
            const response = await getMcpServers();
            ctx.setLoading(null);
            if (!response.success) {
                return { error: 'Failed to load MCP status' };
            }
            const servers = Object.entries(response.data.servers);
            if (servers.length === 0) {
                return { message: 'No MCP servers configured.\nGo to /mcp to add servers.' };
            }
            const list = servers
                .map(([name, config]) => {
                    const status = config.disabled ? 'disabled' : 'enabled';
                    const transport = config.transport || 'stdio';
                    return `${config.disabled ? '○' : '●'} ${name} (${transport}, ${status})`;
                })
                .join('\n');
            return {
                message: `MCP Servers:\n\n${list}\n\n${response.data.tools.length} tools available`,
            };
        },
    },
    {
        name: 'status',
        aliases: ['health'],
        description: 'Show Nero status',
        execute: async (_, ctx) => {
            ctx.setLoading('Checking status');
            const response = await getHealth();
            ctx.setLoading(null);
            if (!response.success) {
                return { error: 'Failed to get status' };
            }
            const { version, model, mcpTools } = response.data;
            return {
                message: `Nero Status:\n\n  Version: ${version}\n  Model: ${model}\n  MCP Tools: ${mcpTools}`,
            };
        },
    },
    {
        name: 'settings',
        aliases: ['config'],
        description: 'Show current settings',
        execute: async (_, ctx) => {
            ctx.setLoading('Loading settings');
            const response = await getSettings();
            ctx.setLoading(null);
            if (!response.success) {
                return { error: 'Failed to load settings' };
            }
            const { settings } = response.data;
            return {
                message: `Settings:\n\n  Model: ${settings.model}\n  Streaming: ${settings.streaming ? 'on' : 'off'}\n  Verbose: ${settings.verbose ? 'on' : 'off'}`,
            };
        },
    },
    {
        name: 'model',
        aliases: ['m'],
        description: 'Show or change the current model',
        execute: async (args, ctx) => {
            ctx.setLoading('Loading settings');
            const response = await getSettings();
            ctx.setLoading(null);

            if (!response.success) {
                return { error: 'Failed to load settings' };
            }

            if (args.length === 0) {
                return { message: `Current model: ${response.data.settings.model}` };
            }

            const newModel = args.join('/');

            ctx.setLoading('Validating model');
            const isValid = await validateModel(newModel);
            ctx.setLoading(null);

            if (!isValid) {
                return {
                    error: `Model not found: ${newModel}\nCheck available models at https://openrouter.ai/models`,
                };
            }

            ctx.setLoading('Updating model');
            const updateResponse = await updateSettings({ model: newModel });
            ctx.setLoading(null);

            if (!updateResponse.success) {
                return { error: 'Failed to update model' };
            }
            return { message: `Model changed to ${newModel}` };
        },
    },
    {
        name: 'memories',
        aliases: [],
        description: 'Go to memories page',
        execute: async (_, ctx) => {
            ctx.navigateTo('/memories');
            return {};
        },
    },
    {
        name: 'voice',
        aliases: ['call'],
        description: 'Go to voice mode',
        execute: async (_, ctx) => {
            ctx.navigateTo('/voice');
            return {};
        },
    },
    {
        name: 'streaming',
        aliases: ['stream'],
        description: 'Toggle streaming mode on/off',
        execute: async (args, ctx) => {
            ctx.setLoading('Loading settings');
            const response = await getSettings();
            ctx.setLoading(null);

            if (!response.success) {
                return { error: 'Failed to load settings' };
            }

            const current = response.data.settings.streaming;

            if (args.length === 0) {
                return {
                    message: `Streaming is currently ${current ? 'on' : 'off'}.\nUse /streaming on or /streaming off to change.`,
                };
            }

            const arg = args[0].toLowerCase();
            let newValue: boolean;

            if (arg === 'on' || arg === 'true' || arg === '1') {
                newValue = true;
            } else if (arg === 'off' || arg === 'false' || arg === '0') {
                newValue = false;
            } else if (arg === 'toggle') {
                newValue = !current;
            } else {
                return { error: `Invalid argument: ${arg}. Use on, off, or toggle.` };
            }

            if (newValue === current) {
                return { message: `Streaming is already ${current ? 'on' : 'off'}.` };
            }

            ctx.setLoading('Updating settings');
            const updateResponse = await updateSettings({ streaming: newValue });
            ctx.setLoading(null);

            if (!updateResponse.success) {
                return { error: 'Failed to update streaming setting' };
            }

            return { message: `Streaming ${newValue ? 'enabled' : 'disabled'}.` };
        },
    },
    {
        name: 'compact',
        aliases: [],
        description: 'Compact conversation to save context',
        execute: async (_, ctx) => {
            ctx.setLoading('Compacting conversation');
            const response = await compactContext();
            ctx.setLoading(null);

            if (!response.success) {
                return { error: 'Failed to compact conversation' };
            }

            return {
                message: `Conversation compacted.\n\nSummary:\n${response.summary || 'No summary available.'}`,
            };
        },
    },
    {
        name: 'abort',
        aliases: ['stop'],
        description: 'Stop the current request',
        execute: async () => {
            const response = await abortChat();

            if (!response.success) {
                return { error: 'Failed to abort request' };
            }

            return { message: response.message || 'Request aborted.' };
        },
    },
    {
        name: 'context',
        aliases: ['ctx'],
        description: 'Show context/token usage',
        execute: async (_, ctx) => {
            ctx.setLoading('Loading context');
            const response = await getContext();
            ctx.setLoading(null);

            if (!response.success) {
                return { error: 'Failed to load context' };
            }

            const { tokens, limit, percentage } = response.data;
            return {
                widget: {
                    type: 'context',
                    data: { tokens, limit, percentage },
                },
            };
        },
    },
    {
        name: 'usage',
        aliases: ['credits', 'balance'],
        description: 'Show OpenRouter API usage and credits',
        execute: async (_, ctx) => {
            ctx.setLoading('Fetching usage');
            const response = await getUsage();
            ctx.setLoading(null);

            if (!response.success) {
                return { error: response.error || 'Failed to fetch usage' };
            }

            const { limit, usage, limit_remaining } = response.data;
            return {
                widget: {
                    type: 'usage',
                    data: {
                        limit: limit,
                        usage: usage || 0,
                        remaining: limit_remaining ?? 0,
                    },
                },
            };
        },
    },
    {
        name: 'install-slack',
        aliases: ['slack'],
        description: 'Connect Nero to Slack',
        execute: async (_, ctx) => {
            ctx.setLoading('Getting Slack install URL');
            const response = await installSlack();
            ctx.setLoading(null);

            if (!response.success) {
                return { error: response.error || 'Failed to get Slack install URL' };
            }

            window.open(response.data.url, '_blank');
            return {
                message:
                    'Opening Slack authorization in a new tab.\nOnce done, you can DM Nero directly in Slack!',
            };
        },
    },
    {
        name: 'revoke',
        aliases: [],
        description: 'Manage always-allowed tool permissions',
        execute: async (args, ctx) => {
            ctx.setLoading('Loading allowed tools');
            const response = await getAllowedTools();
            ctx.setLoading(null);

            if (!response.success) {
                return { error: 'Failed to load allowed tools' };
            }

            const allowed = response.data;

            if (args.length === 0) {
                if (allowed.length === 0) {
                    return { message: 'No tools are always-allowed.' };
                }
                let msg = `Always-allowed tools:\n\n`;
                msg += allowed.map((t) => `  ${t}`).join('\n');
                msg += `\n\nUse /revoke <tool> to remove.`;
                return { message: msg };
            }

            const tool = args[0];
            if (!allowed.includes(tool)) {
                return { error: `Tool "${tool}" is not in the always-allowed list.` };
            }

            ctx.setLoading('Revoking permission');
            const revokeResponse = await revokeAllowedTool(tool);
            ctx.setLoading(null);

            if (!revokeResponse.success) {
                return { error: 'Failed to revoke tool permission' };
            }

            return { message: `Revoked always-allow for "${tool}".` };
        },
    },
    {
        name: 'think',
        aliases: [],
        description: 'Run background thinking loop manually',
        execute: async (_, ctx) => {
            ctx.setLoading('Thinking');

            const activities: ThinkActivity[] = [];
            let thought: string | null = null;
            let urgent = false;
            let error: string | null = null;

            await new Promise<void>((resolve) => {
                streamThink({
                    callbacks: {
                        onActivity: (activity: ToolActivity) => {
                            if (ctx.addActivity) {
                                ctx.addActivity(activity);
                            }

                            if (activity.status === 'running') {
                                ctx.setLoading(`Running ${activity.displayName || activity.tool}`);
                                activities.push({
                                    tool: activity.tool,
                                    status: 'running',
                                });
                            } else if (activity.status === 'complete') {
                                const existing = activities.find(
                                    (a) => a.tool === activity.tool && a.status === 'running',
                                );
                                if (existing) {
                                    existing.status = 'complete';
                                }
                            } else if (activity.status === 'error') {
                                const existing = activities.find(
                                    (a) => a.tool === activity.tool && a.status === 'running',
                                );
                                if (existing) {
                                    existing.status = 'error';
                                    existing.error = activity.error;
                                }
                            }
                        },
                        onStatus: (status: string) => {
                            ctx.setLoading(status);
                        },
                        onDone: (t: string | null, u: boolean) => {
                            thought = t;
                            urgent = u;
                            resolve();
                        },
                        onError: (err: string) => {
                            error = err;
                            resolve();
                        },
                    },
                });
            });

            ctx.setLoading(null);

            if (error) {
                return { error: `Thinking failed: ${error}` };
            }

            return {
                widget: {
                    type: 'think',
                    data: { activities, thought, urgent },
                },
            };
        },
    },
];

export function findCommand(input: string): SlashCommand | null {
    const name = input.toLowerCase();
    return commands.find((cmd) => cmd.name === name || cmd.aliases.includes(name)) || null;
}

export function getCommandSuggestions(partial: string): SlashCommand[] {
    const lower = partial.toLowerCase();
    return commands.filter(
        (cmd) => cmd.name.startsWith(lower) || cmd.aliases.some((a) => a.startsWith(lower)),
    );
}

export function isSlashCommand(input: string): boolean {
    return input.startsWith('/');
}

export async function executeCommand(input: string, ctx: CommandContext): Promise<CommandResult> {
    const parts = input.slice(1).split(/\s+/);
    const cmdName = parts[0];
    const args = parts.slice(1);

    const command = findCommand(cmdName);
    if (!command) {
        return { error: `Unknown command: ${cmdName}. Type /help for available commands.` };
    }

    try {
        return await command.execute(args, ctx);
    } catch (error) {
        const err = error as Error;
        return { error: `Command failed: ${err.message}` };
    }
}
