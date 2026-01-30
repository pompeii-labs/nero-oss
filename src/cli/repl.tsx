import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { render, Box, Text, useInput, useApp, Static, useStdout } from 'ink';
import type { Key } from 'ink';
import chalk from 'chalk';
import wrapAnsi from 'wrap-ansi';
import { NeroConfig, loadConfig, isToolAllowed, addAllowedTool } from '../config.js';
import { ToolActivity, LoadedMessage } from '../agent/nero.js';
import { NeroClient } from '../client/index.js';
import { NeroProxy } from '../client/proxy.js';
import { Logger, formatToolName } from '../util/logger.js';
import { VERSION } from '../util/version.js';
import { commands, getCommandSuggestions, executeCommand, CommandContext } from './commands.js';
import { NERO_BLUE, GLITCH_CHARS } from './theme.js';
import { generateDiff, formatDiffStats, DiffResult } from '../util/diff.js';

interface NeroInputProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: (value: string) => void;
    onCtrlC: () => void;
    placeholder?: string;
    focus?: boolean;
}

function findWordBoundaryLeft(text: string, cursor: number): number {
    if (cursor <= 0) return 0;
    let pos = cursor - 1;
    while (pos > 0 && /\s/.test(text[pos]!)) pos--;
    while (pos > 0 && !/\s/.test(text[pos - 1]!)) pos--;
    return pos;
}

function findWordBoundaryRight(text: string, cursor: number): number {
    if (cursor >= text.length) return text.length;
    let pos = cursor;
    while (pos < text.length && !/\s/.test(text[pos]!)) pos++;
    while (pos < text.length && /\s/.test(text[pos]!)) pos++;
    return pos;
}

function extractBashPattern(command: string): string {
    const parts = command.trim().split(/\s+/);
    if (parts.length === 0) return command;

    const base = parts[0] || '';
    const subcommandTools = ['npm', 'bun', 'yarn', 'pnpm', 'git', 'docker', 'make'];

    if (subcommandTools.includes(base) && parts.length >= 2) {
        return `${parts[0]} ${parts[1]} *`;
    }

    return `${base} *`;
}

function NeroInput({ value, onChange, onSubmit, onCtrlC, placeholder = '', focus = true }: NeroInputProps) {
    const [cursor, setCursor] = useState(value.length);

    useEffect(() => {
        if (cursor > value.length) setCursor(value.length);
    }, [value, cursor]);

    useInput((input, key) => {
        if (!focus) return;

        if (key.ctrl && input === 'c') {
            onCtrlC();
            return;
        }

        if (key.ctrl && input === 'w') {
            if (cursor > 0) {
                const boundary = findWordBoundaryLeft(value, cursor);
                onChange(value.slice(0, boundary) + value.slice(cursor));
                setCursor(boundary);
            }
            return;
        }

        if (key.return) {
            onSubmit(value);
            return;
        }

        if (key.leftArrow) {
            if (key.meta) {
                setCursor(findWordBoundaryLeft(value, cursor));
            } else {
                setCursor(Math.max(0, cursor - 1));
            }
            return;
        }

        if (key.rightArrow) {
            if (key.meta) {
                setCursor(findWordBoundaryRight(value, cursor));
            } else {
                setCursor(Math.min(value.length, cursor + 1));
            }
            return;
        }

        if (key.backspace || key.delete) {
            if (cursor > 0) {
                onChange(value.slice(0, cursor - 1) + value.slice(cursor));
                setCursor(cursor - 1);
            }
            return;
        }

        if (key.upArrow || key.downArrow || key.tab || key.escape) {
            return;
        }

        if (input) {
            onChange(value.slice(0, cursor) + input + value.slice(cursor));
            setCursor(cursor + input.length);
        }
    }, { isActive: focus });

    const displayValue = value || '';
    const showPlaceholder = displayValue.length === 0 && placeholder;

    if (showPlaceholder) {
        return (
            <Text>
                <Text inverse> </Text>
                <Text dimColor>{placeholder.slice(1)}</Text>
            </Text>
        );
    }

    const before = displayValue.slice(0, cursor);
    const cursorChar = displayValue[cursor] || ' ';
    const after = displayValue.slice(cursor + 1);

    return (
        <Text>
            {before}
            <Text inverse>{cursorChar}</Text>
            {after}
        </Text>
    );
}

function getGlitchChar(): string {
    return GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
}


function formatArgValue(value: unknown, maxLen = 60): string {
    if (typeof value === 'string') {
        if (value.length > maxLen) return value.slice(0, maxLen) + '...';
        return value;
    }
    if (typeof value === 'object' && value !== null) {
        const str = JSON.stringify(value);
        if (str.length > maxLen) return str.slice(0, maxLen) + '...';
        return str;
    }
    return String(value);
}

function normalizeText(text: string): string {
    return text
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/ +\n/g, '\n')
        .replace(/\n +/g, '\n')
        .trim();
}

function wrapText(text: string, width: number): string {
    if (width <= 0) width = 80;
    return wrapAnsi(normalizeText(text), width - 2, { hard: true, trim: true });
}

function getToolGlyph(status: string): string {
    if (status === 'complete') return '◆';
    if (status === 'error') return '◇';
    if (status === 'skipped') return '⊘';
    if (status === 'running') return '○';
    return '○';
}

function NeroBlock({ items, hiddenCount, termWidth }: { items?: TurnItem[]; hiddenCount: number; termWidth: number }) {
    const hasContent = items && items.some(i => i.type === 'text' && i.content);

    return (
        <Box flexDirection="column">
            <Text color={NERO_BLUE} bold underline>nero</Text>
            {hiddenCount > 0 && (
                <Text dimColor>... +{hiddenCount} earlier</Text>
            )}
            {items && items.map((item) => (
                item.type === 'tool' && item.toolData ? (
                    <ToolLogDisplay key={item.id} toolData={item.toolData} />
                ) : item.type === 'text' && item.content ? (
                    <Text key={item.id}>{wrapText(item.content, termWidth)}</Text>
                ) : null
            ))}
            {!hasContent && (
                <Text dimColor>[no response]</Text>
            )}
        </Box>
    );
}

function ToolLogDisplay({ toolData }: { toolData: ToolMessage }) {
    const isRunning = toolData.status === 'running';
    const glyph = getToolGlyph(toolData.status);
    const glyphColor = toolData.status === 'complete' ? NERO_BLUE :
                       toolData.status === 'error' ? 'red' :
                       toolData.status === 'skipped' ? 'yellow' :
                       toolData.status === 'running' ? 'cyan' : 'gray';
    const toolName = toolData.displayName || formatToolName(toolData.tool);

    const isWrite = toolData.tool === 'write';
    const hasWriteDiff = isWrite && 'newContent' in toolData.args;

    const diff = useMemo(() => {
        if (!hasWriteDiff) return null;
        const oldContent = toolData.args.oldContent as string | null;
        const newContent = toolData.args.newContent as string;
        return generateDiff(oldContent, newContent);
    }, [hasWriteDiff, toolData.args]);

    const mainArg = Object.entries(toolData.args).find(([key]) =>
        !['isNewFile', 'linesAdded', 'linesRemoved', 'oldContent', 'newContent'].includes(key)
    );
    const argPreview = mainArg ? formatArgValue(mainArg[1], 50) : '';

    const prefix = toolData.status === 'complete' ? '░' : toolData.status === 'skipped' ? '▓' : '▒';

    return (
        <Box flexDirection="column">
            <Box>
                <Text color={glyphColor}>{prefix}</Text>
                <Text color={glyphColor}>{glyph} </Text>
                <Text color={glyphColor} bold>{toolName}</Text>
                {argPreview && <Text dimColor> {argPreview}</Text>}
                {diff && (
                    <Text>
                        {' '}
                        {diff.linesAdded ? <Text color="green">+{diff.linesAdded}</Text> : null}
                        {diff.linesAdded && diff.linesRemoved ? ' ' : null}
                        {diff.linesRemoved ? <Text color="red">-{diff.linesRemoved}</Text> : null}
                    </Text>
                )}
                {isRunning && <Text dimColor> ...</Text>}
            </Box>
            {diff && !isRunning && (
                <Box flexDirection="column" marginLeft={3} marginTop={1}>
                    {diff.lines.slice(0, 20).map((line, i) => {
                        const linePrefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
                        const color = line.type === 'add' ? 'green' : line.type === 'remove' ? 'red' : undefined;
                        const content = line.content.length > 70 ? line.content.slice(0, 67) + '...' : line.content;
                        return (
                            <Text key={i} color={color} dimColor={line.type === 'context'}>{linePrefix} {content}</Text>
                        );
                    })}
                    {diff.lines.length > 20 && (
                        <Text dimColor>  ... +{diff.lines.length - 20} more lines</Text>
                    )}
                </Box>
            )}
            {toolData.result && !isRunning && !diff && (
                <Box marginLeft={3}>
                    <Text dimColor>↳ {toolData.result.length > 70 ? toolData.result.slice(0, 70) + '...' : toolData.result}</Text>
                </Box>
            )}
        </Box>
    );
}

interface ToolMessage {
    tool: string;
    displayName?: string;
    status: 'complete' | 'error' | 'denied' | 'skipped' | 'running';
    args: Record<string, unknown>;
    result?: string;
}

interface TurnItem {
    id: string;
    type: 'text' | 'tool';
    content?: string;
    toolData?: ToolMessage;
}

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'tool' | 'banner';
    content: string;
    toolData?: ToolMessage;
}

interface DisplayGroup {
    id: string;
    type: 'banner' | 'user' | 'nero-block' | 'system';
    content?: string;
    items?: TurnItem[];
    hiddenCount?: number;
}

const MAX_VISIBLE_ITEMS = 5;

function groupMessages(messages: Message[]): DisplayGroup[] {
    const groups: DisplayGroup[] = [];
    let currentNeroItems: TurnItem[] = [];
    let neroBlockId = '';

    const flushNeroBlock = () => {
        if (currentNeroItems.length > 0) {
            const visibleItems = currentNeroItems.slice(-MAX_VISIBLE_ITEMS);
            const hiddenCount = currentNeroItems.length - visibleItems.length;
            groups.push({
                id: neroBlockId,
                type: 'nero-block',
                items: visibleItems,
                hiddenCount,
            });
            currentNeroItems = [];
            neroBlockId = '';
        }
    };

    for (const msg of messages) {
        if (msg.role === 'banner') {
            flushNeroBlock();
            groups.push({ id: msg.id, type: 'banner' });
        } else if (msg.role === 'user') {
            flushNeroBlock();
            groups.push({ id: msg.id, type: 'user', content: msg.content });
        } else if (msg.role === 'system') {
            flushNeroBlock();
            groups.push({ id: msg.id, type: 'system', content: msg.content });
        } else if (msg.role === 'tool' && msg.toolData) {
            if (!neroBlockId) neroBlockId = msg.id;
            currentNeroItems.push({ id: msg.id, type: 'tool', toolData: msg.toolData });
        } else if (msg.role === 'assistant') {
            if (!neroBlockId) neroBlockId = msg.id;
            if (msg.content) {
                currentNeroItems.push({ id: msg.id, type: 'text', content: msg.content });
            }
        }
    }

    flushNeroBlock();
    return groups;
}

interface PendingPermission {
    activity: ToolActivity;
    resolve: (approved: boolean) => void;
}

interface AppProps {
    nero: NeroProxy;
    initialConfig: NeroConfig;
    initialHistory: LoadedMessage[];
    hasSummary: boolean;
}

function AnimatedLoader() {
    const [chars, setChars] = useState(['░', '▒', '▓']);

    useEffect(() => {
        const timer = setInterval(() => {
            setChars([getGlitchChar(), getGlitchChar(), getGlitchChar()]);
        }, 80);
        return () => clearInterval(timer);
    }, []);

    return <Text color={NERO_BLUE}>{chars.join('')}</Text>;
}

function CommandLoader({ message }: { message: string }) {
    const [frame, setFrame] = useState(0);
    const shimmerChars = '░▒▓█▓▒░';

    useEffect(() => {
        const timer = setInterval(() => {
            setFrame(f => (f + 1) % shimmerChars.length);
        }, 120);
        return () => clearInterval(timer);
    }, []);

    const bar = Array(12).fill(null).map((_, i) => {
        const charIndex = (frame + i) % shimmerChars.length;
        return shimmerChars[charIndex];
    }).join('');

    return (
        <Box flexDirection="column" marginY={1}>
            <Box>
                <Text color={NERO_BLUE} bold>{bar}</Text>
            </Box>
            <Box marginTop={0}>
                <Text color={NERO_BLUE}>{message}</Text>
                <Text color={NERO_BLUE} dimColor>...</Text>
            </Box>
        </Box>
    );
}

function DiffView({ diff, path, isNewFile }: { diff: DiffResult; path: string; isNewFile: boolean }) {
    return (
        <Box flexDirection="column" marginTop={1}>
            <Box>
                <Text dimColor>{isNewFile ? 'New file: ' : 'Changes to: '}</Text>
                <Text>{path}</Text>
            </Box>
            <Box marginTop={1}>
                {diff.linesAdded > 0 && <Text color="green">+{diff.linesAdded} </Text>}
                {diff.linesRemoved > 0 && <Text color="red">-{diff.linesRemoved}</Text>}
            </Box>
            <Box flexDirection="column" marginTop={1}>
                {diff.lines.slice(0, 30).map((line, i) => {
                    const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
                    const color = line.type === 'add' ? 'green' : line.type === 'remove' ? 'red' : undefined;
                    const content = line.content.length > 80 ? line.content.slice(0, 77) + '...' : line.content;
                    return (
                        <Text key={i} color={color}>{prefix} {content}</Text>
                    );
                })}
                {diff.lines.length > 30 && (
                    <Text dimColor>... +{diff.lines.length - 30} more lines</Text>
                )}
                {diff.truncated && (
                    <Text dimColor>(diff truncated)</Text>
                )}
            </Box>
        </Box>
    );
}

function PermissionPrompt({
    activity,
    onRespond,
    onAlwaysAllow
}: {
    activity: ToolActivity;
    onRespond: (approved: boolean) => void;
    onAlwaysAllow: (activity: ToolActivity) => void;
}) {
    useInput((input, key) => {
        if (input === 'y' || input === 'Y' || key.return) {
            onRespond(true);
        } else if (input === 'n' || input === 'N' || key.escape) {
            onRespond(false);
        } else if (input === 'a' || input === 'A') {
            onAlwaysAllow(activity);
            onRespond(true);
        }
    });

    const toolName = activity.displayName || formatToolName(activity.tool);
    const args = activity.args;
    const isWriteWithDiff = activity.tool === 'write' && 'newContent' in args;

    const diff = useMemo(() => {
        if (!isWriteWithDiff) return null;
        const oldContent = args.oldContent as string | null;
        const newContent = args.newContent as string;
        return generateDiff(oldContent, newContent);
    }, [isWriteWithDiff, args]);

    const displayArgs = Object.entries(args).filter(
        ([key]) => !['oldContent', 'newContent', 'isNewFile'].includes(key)
    );

    return (
        <Box flexDirection="column" marginY={1}>
            <Text color={NERO_BLUE}>░▒▓ <Text bold>Permission Required</Text></Text>
            <Box flexDirection="column" borderStyle="single" borderColor={NERO_BLUE} paddingX={2} paddingY={1}>
                <Box>
                    <Text color={NERO_BLUE} bold>{toolName}</Text>
                </Box>
                {displayArgs.length > 0 && (
                    <Box flexDirection="column" marginTop={1}>
                        {displayArgs.slice(0, 3).map(([key, value]) => (
                            <Box key={key}>
                                <Text dimColor>{key}: </Text>
                                <Text>{formatArgValue(value, 50)}</Text>
                            </Box>
                        ))}
                        {displayArgs.length > 3 && (
                            <Text dimColor>... +{displayArgs.length - 3} more</Text>
                        )}
                    </Box>
                )}
                {diff && (
                    <DiffView
                        diff={diff}
                        path={args.path as string}
                        isNewFile={args.isNewFile as boolean}
                    />
                )}
                <Box marginTop={1}>
                    <Text dimColor>[</Text><Text color={NERO_BLUE} bold>y</Text><Text dimColor>]es </Text>
                    <Text dimColor>[</Text><Text color={NERO_BLUE} bold>n</Text><Text dimColor>]o </Text>
                    <Text dimColor>[</Text><Text color={NERO_BLUE} bold>a</Text><Text dimColor>]lways</Text>
                </Box>
            </Box>
        </Box>
    );
}

function WelcomeBanner({ model }: { model: string }) {
    return (
        <Box flexDirection="column" marginBottom={1}>
            <Text color={NERO_BLUE} bold>
{` ███╗   ██╗███████╗██████╗  ██████╗
 ████╗  ██║██╔════╝██╔══██╗██╔═══██╗
 ██╔██╗ ██║█████╗  ██████╔╝██║   ██║
 ██║╚██╗██║██╔══╝  ██╔══██╗██║   ██║
 ██║ ╚████║███████╗██║  ██║╚██████╔╝
 ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝`}
            </Text>
            <Text> </Text>
            <Text dimColor>  v{VERSION} | {model}</Text>
            <Text dimColor>  Type a message to get started, or /help for commands</Text>
        </Box>
    );
}

function CommandSuggestions({ input }: { input: string }) {
    if (!input.startsWith('/')) return null;

    const partial = input.slice(1).split(/\s/)[0];
    const suggestions = getCommandSuggestions(partial);

    if (suggestions.length === 0 || (suggestions.length === 1 && suggestions[0].name === partial)) {
        return null;
    }

    return (
        <Box flexDirection="column" marginLeft={2} marginTop={1}>
            {suggestions.slice(0, 5).map((cmd) => (
                <Text key={cmd.name} dimColor>
                    /{cmd.name} <Text color="gray">- {cmd.description}</Text>
                </Text>
            ))}
        </Box>
    );
}

function App({ nero, initialConfig, initialHistory, hasSummary }: AppProps) {
    const { exit } = useApp();
    const { stdout } = useStdout();
    const termWidth = stdout?.columns || 80;
    const [input, setInput] = useState('');

    const buildInitialMessages = (): Message[] => {
        const msgs: Message[] = [{ id: 'banner', role: 'banner', content: '' }];

        if (initialHistory.length > 0) {
            if (hasSummary) {
                msgs.push({
                    id: 'history-summary',
                    role: 'system',
                    content: chalk.dim('--- Loaded from previous session (with summary) ---'),
                });
            } else {
                msgs.push({
                    id: 'history-divider',
                    role: 'system',
                    content: chalk.dim(`--- Loaded ${initialHistory.length} messages from previous session ---`),
                });
            }

            initialHistory.forEach((msg, index) => {
                msgs.push({
                    id: `history-${index}-${msg.created_at}`,
                    role: msg.role,
                    content: msg.content,
                });
            });

            msgs.push({
                id: 'history-end',
                role: 'system',
                content: chalk.dim('--- End of history ---'),
            });
        }

        return msgs;
    };

    const [messages, setMessages] = useState<Message[]>(buildInitialMessages);
    const [currentTurnItems, setCurrentTurnItems] = useState<TurnItem[]>([]);
    const currentTurnItemsRef = useRef<TurnItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [streamingText, setStreamingText] = useState('');
    const streamingTextRef = useRef('');
    const [config, setConfig] = useState(initialConfig);
    const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
    const [currentActivity, setCurrentActivity] = useState<ToolActivity | null>(null);
    const [commandLoading, setCommandLoading] = useState<string | null>(null);
    const processingRef = useRef(false);
    const messageIdRef = useRef(0);
    const lastCtrlCRef = useRef<number>(0);
    const ctrlCCountRef = useRef(0);
    const permissionResolverRef = useRef<((approved: boolean) => void) | null>(null);

    const genId = () => {
        messageIdRef.current += 1;
        return `msg-${messageIdRef.current}`;
    };

    const addMessage = useCallback((role: Message['role'], content: string, toolData?: ToolMessage) => {
        setMessages(prev => [...prev, { id: genId(), role, content, toolData }]);
    }, []);

    const flushedLengthRef = useRef(0);

    const finalizeTurn = useCallback((finalContent?: string) => {
        const allItems = [...currentTurnItemsRef.current];
        if (finalContent?.trim()) {
            allItems.push({
                id: `text-final-${Date.now()}`,
                type: 'text',
                content: finalContent,
            });
        }

        setMessages(prev => {
            const newMessages = [...prev];
            for (const item of allItems) {
                if (item.type === 'tool' && item.toolData) {
                    newMessages.push({ id: genId(), role: 'tool', content: '', toolData: item.toolData as ToolMessage });
                } else if (item.type === 'text' && item.content) {
                    newMessages.push({ id: genId(), role: 'assistant', content: item.content });
                }
            }
            return newMessages;
        });
        currentTurnItemsRef.current = [];
        setCurrentTurnItems([]);
        streamingTextRef.current = '';
        setStreamingText('');
        flushedLengthRef.current = 0;
    }, []);

    const flushStreamingText = useCallback(() => {
        const fullText = streamingTextRef.current;
        const newText = fullText.slice(flushedLengthRef.current);
        if (newText.trim()) {
            const newItem: TurnItem = {
                id: `text-${Date.now()}`,
                type: 'text',
                content: newText,
            };
            currentTurnItemsRef.current = [...currentTurnItemsRef.current, newItem];
            setCurrentTurnItems(currentTurnItemsRef.current);
        }
        flushedLengthRef.current = fullText.length;
    }, []);

    useEffect(() => {
        nero.setActivityCallback((activity) => {
            if (activity.status === 'running') {
                flushStreamingText();
                setCurrentActivity(activity);
                const newItem: TurnItem = {
                    id: `tool-${Date.now()}`,
                    type: 'tool',
                    toolData: {
                        tool: activity.tool,
                        status: 'running',
                        args: activity.args,
                    },
                };
                currentTurnItemsRef.current = [...currentTurnItemsRef.current, newItem];
                setCurrentTurnItems(currentTurnItemsRef.current);
            } else if (activity.status === 'complete' || activity.status === 'error') {
                setCurrentActivity(null);
                currentTurnItemsRef.current = currentTurnItemsRef.current.map(item =>
                    item.type === 'tool' && item.toolData?.tool === activity.tool && item.toolData?.status === 'running'
                        ? {
                            ...item,
                            toolData: {
                                ...item.toolData,
                                status: activity.status as 'complete' | 'error',
                                result: activity.result || activity.error,
                            },
                        }
                        : item
                );
                setCurrentTurnItems(currentTurnItemsRef.current);
            } else if (activity.status === 'denied') {
                setCurrentActivity(null);
                currentTurnItemsRef.current = currentTurnItemsRef.current.map(item =>
                    item.type === 'tool' && item.toolData?.tool === activity.tool && item.toolData?.status === 'running'
                        ? {
                            ...item,
                            toolData: {
                                ...item.toolData,
                                status: 'denied' as const,
                            },
                        }
                        : item
                );
                setCurrentTurnItems(currentTurnItemsRef.current);
            } else if (activity.status === 'skipped') {
                const newItem: TurnItem = {
                    id: `tool-${Date.now()}`,
                    type: 'tool',
                    toolData: {
                        tool: activity.tool,
                        args: activity.args,
                        status: 'skipped',
                        result: activity.skipReason,
                    },
                };
                currentTurnItemsRef.current = [...currentTurnItemsRef.current, newItem];
                setCurrentTurnItems(currentTurnItemsRef.current);
            }
        });

        nero.setPermissionCallback(async (activity) => {
            if (isToolAllowed(activity.tool, activity.args)) {
                return true;
            }
            return new Promise((resolve) => {
                permissionResolverRef.current = resolve;
                setPendingPermission({ activity, resolve });
            });
        });
    }, [nero, addMessage]);

    const handlePermissionResponse = useCallback((approved: boolean) => {
        if (permissionResolverRef.current) {
            permissionResolverRef.current(approved);
            permissionResolverRef.current = null;
        }
        setPendingPermission(null);
    }, []);

    const handleAlwaysAllow = useCallback(async (activity: ToolActivity) => {
        if (activity.tool === 'bash' && activity.args?.command) {
            const command = String(activity.args.command).trim();
            const pattern = extractBashPattern(command);
            await addAllowedTool(`bash:${pattern}`);
        } else {
            await addAllowedTool(activity.tool);
        }
    }, []);

    const clearMessages = useCallback(() => {
        setMessages([]);
    }, []);

    const handleSubmit = useCallback(async (value: string) => {
        const trimmed = value.trim();
        if (!trimmed || processingRef.current) return;

        setInput('');

        if (trimmed.startsWith('/')) {
            const ctx: CommandContext = {
                nero,
                config,
                clearScreen: clearMessages,
                exit,
                log: (msg) => addMessage('system', msg),
                setLoading: setCommandLoading,
            };

            const result = await executeCommand(trimmed, ctx);
            setCommandLoading(null);

            if (result.message) {
                addMessage('system', result.message);
            }
            if (result.error) {
                addMessage('system', chalk.red(result.error));
            }

            const newConfig = await loadConfig();
            setConfig(newConfig);
            return;
        }

        processingRef.current = true;
        addMessage('user', trimmed);
        currentTurnItemsRef.current = [];
        setCurrentTurnItems([]);
        streamingTextRef.current = '';
        setStreamingText('');
        flushedLengthRef.current = 0;
        setIsLoading(true);

        try {
            let finalContent = '';

            if (config.settings.streaming) {
                let lastUpdate = 0;
                const THROTTLE_MS = 80;

                await nero.chat(trimmed, (chunk) => {
                    finalContent += chunk;
                    streamingTextRef.current = finalContent;

                    const now = Date.now();
                    if (now - lastUpdate >= THROTTLE_MS) {
                        lastUpdate = now;
                        setStreamingText(finalContent);
                    }
                });
                setStreamingText(finalContent);
                flushStreamingText();
                finalizeTurn();
            } else {
                const response = await nero.chat(trimmed);
                finalizeTurn(response.content);
            }
        } catch (error) {
            const err = error as Error;
            addMessage('system', chalk.red(`Error: ${err.message}`));
        } finally {
            setStreamingText('');
            setIsLoading(false);
            processingRef.current = false;
        }
    }, [nero, config, addMessage, clearMessages, exit]);

    const handleCtrlC = useCallback(() => {
        const now = Date.now();
        const timeSinceLastCtrlC = now - lastCtrlCRef.current;

        if (timeSinceLastCtrlC > 1500) {
            ctrlCCountRef.current = 0;
        }

        ctrlCCountRef.current += 1;
        lastCtrlCRef.current = now;

        if (ctrlCCountRef.current === 1) {
            if (input.length > 0) {
                setInput('');
                ctrlCCountRef.current = 0;
            } else if (isLoading || processingRef.current) {
                addMessage('system', chalk.hex(NERO_BLUE)('Press Ctrl+C again to cancel'));
            } else {
                addMessage('system', chalk.hex(NERO_BLUE)('Press Ctrl+C again to exit'));
            }
        } else if (ctrlCCountRef.current >= 2) {
            if (isLoading || processingRef.current) {
                nero.abort().catch(() => {});
                setIsLoading(false);
                processingRef.current = false;
                setStreamingText('');
                currentTurnItemsRef.current = [];
                setCurrentTurnItems([]);
                addMessage('system', chalk.dim('Cancelled'));
                ctrlCCountRef.current = 0;
            } else {
                exit();
            }
        }
    }, [input, isLoading, addMessage, exit]);

    const displayGroups = groupMessages(messages);

    return (
        <Box flexDirection="column" padding={1}>
            <Static items={displayGroups}>
                {(group) => (
                    <Box key={group.id} marginBottom={1} flexDirection="column">
                        {group.type === 'banner' && (
                            <WelcomeBanner model={config.settings.model} />
                        )}
                        {group.type === 'user' && (
                            <Box flexDirection="column">
                                <Text color="cyan" bold underline>you</Text>
                                <Text>{wrapText(group.content || '', termWidth)}</Text>
                            </Box>
                        )}
                        {group.type === 'system' && (
                            <Text>{group.content}</Text>
                        )}
                        {group.type === 'nero-block' && (
                            <NeroBlock
                                items={group.items}
                                hiddenCount={group.hiddenCount || 0}
                                termWidth={termWidth}
                            />
                        )}
                    </Box>
                )}
            </Static>

            {isLoading && !pendingPermission && (
                <Box marginBottom={1} flexDirection="column">
                    <Text color={NERO_BLUE} bold underline>nero</Text>
                    {(() => {
                        const toolItems = currentTurnItems.filter(i => i.type === 'tool');
                        const hiddenTools = Math.max(0, toolItems.length - MAX_VISIBLE_ITEMS);
                        return (
                            <>
                                {hiddenTools > 0 && (
                                    <Text dimColor>... +{hiddenTools} earlier</Text>
                                )}
                                {toolItems.slice(-MAX_VISIBLE_ITEMS).map((item) => (
                                    item.toolData ? <ToolLogDisplay key={item.id} toolData={item.toolData} /> : null
                                ))}
                            </>
                        );
                    })()}
                    {(() => {
                        const unflushedText = streamingText.slice(flushedLengthRef.current);
                        return (
                            <>
                                {unflushedText.trim() && (
                                    <Text>{wrapText(unflushedText, termWidth)}{!currentActivity && <Text dimColor>▊</Text>}</Text>
                                )}
                                {(currentActivity || !unflushedText.trim()) && (
                                    <Box>
                                        <AnimatedLoader />
                                        <Text dimColor> {currentActivity ? formatToolName(currentActivity.tool) : 'thinking...'}</Text>
                                    </Box>
                                )}
                            </>
                        );
                    })()}
                </Box>
            )}

            {pendingPermission && (
                <PermissionPrompt
                    activity={pendingPermission.activity}
                    onRespond={handlePermissionResponse}
                    onAlwaysAllow={handleAlwaysAllow}
                />
            )}

            {commandLoading && (
                <CommandLoader message={commandLoading} />
            )}

            {!pendingPermission && !commandLoading && (
                <Box flexDirection="column">
                    <Box>
                        <Text color="cyan" bold>&gt; </Text>
                        <NeroInput
                            value={input}
                            onChange={setInput}
                            onSubmit={handleSubmit}
                            onCtrlC={handleCtrlC}
                            placeholder={isLoading ? '' : 'Type a message or /help...'}
                            focus={!isLoading}
                        />
                    </Box>
                </Box>
            )}

            <CommandSuggestions input={input} />

            <Box marginTop={1}>
                <Text dimColor>Enter to send | Opt+←→ nav | Ctrl+W del word | Ctrl+C exit</Text>
            </Box>
        </Box>
    );
}

export async function startRepl(config: NeroConfig): Promise<void> {
    const logger = new Logger('CLI');
    const serviceUrl = process.env.NERO_SERVICE_URL || 'http://localhost:4848';
    const serviceRunning = await NeroClient.checkServiceRunning(serviceUrl);

    if (!serviceRunning) {
        logger.error('Nero service not running');
        console.log(chalk.dim('\nStart the service with:'));
        console.log(chalk.cyan('  docker-compose up -d\n'));
        process.exit(1);
    }

    const licenseKey = config.licenseKey || undefined;
    const nero = new NeroProxy(serviceUrl, process.cwd(), licenseKey);
    await nero.setup();

    const initialHistory = nero.getLoadedMessages();
    const hasSummary = nero.hasPreviousSummary();

    console.clear();

    const { waitUntilExit } = render(
        <App
            nero={nero}
            initialConfig={config}
            initialHistory={initialHistory}
            hasSummary={hasSummary}
        />,
        { exitOnCtrlC: false }
    );

    await waitUntilExit();
    await nero.cleanup();
    process.exit(0);
}
