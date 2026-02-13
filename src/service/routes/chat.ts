import { Router, Request, Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import { existsSync } from 'fs';
import { Nero, ToolActivity } from '../../agent/nero.js';
import { Logger } from '../../util/logger.js';
import { isDbConnected } from '../../db/index.js';
import { Workspace, ThinkingRun, BackgroundLog } from '../../models/index.js';
import { hostToContainer } from '../../util/paths.js';
import {
    isToolAllowed,
    addAllowedTool,
    getAllowedTools,
    removeAllowedTool,
    loadConfig,
} from '../../config.js';
import { loadSkill, getSkillContent } from '../../skills/index.js';
import { saveUpload, getFilePath, type FileRef } from '../../files/index.js';
import { readFile as readFileFromDisk } from 'fs/promises';

interface AttachmentUpload {
    data: string;
    name: string;
    mimeType: string;
}

interface ChatRequest {
    message: string;
    medium?: 'cli' | 'api' | 'voice' | 'sms';
    cwd?: string;
    attachments?: AttachmentUpload[];
}

interface PendingPermission {
    resolve: (approved: boolean) => void;
    timeout: NodeJS.Timeout;
}

const pendingPermissions = new Map<string, PendingPermission>();

async function registerWorkspace(cwdPath: string, detectedFrom: string): Promise<void> {
    if (!isDbConnected()) return;

    const name = path.basename(cwdPath);
    await Workspace.upsert(cwdPath, name, detectedFrom);
}

export function createChatRouter(agent: Nero) {
    const router = Router();
    const logger = new Logger('Chat');

    router.post('/permission/:id', (req: Request, res: Response) => {
        const id = req.params.id as string;
        const { approved, alwaysAllow } = req.body as { approved: boolean; alwaysAllow?: boolean };

        const pending = pendingPermissions.get(id);
        if (!pending) {
            res.status(404).json({ error: 'Permission request not found or expired' });
            return;
        }

        clearTimeout(pending.timeout);
        pendingPermissions.delete(id);
        pending.resolve(approved);

        logger.debug(
            `Permission ${id} ${approved ? 'approved' : 'denied'}${alwaysAllow ? ' (always)' : ''}`,
        );
        res.json({ success: true });
    });

    router.get('/permissions', async (req: Request, res: Response) => {
        const allowed = getAllowedTools();
        res.json({ allowed });
    });

    router.post('/permissions/allow', async (req: Request, res: Response) => {
        const { tool } = req.body as { tool: string };
        if (!tool) {
            res.status(400).json({ error: 'Tool name is required' });
            return;
        }
        await addAllowedTool(tool);
        logger.info(`Added always-allow permission for tool: ${tool}`);
        res.json({ success: true });
    });

    router.delete('/permissions/allow/:tool', async (req: Request, res: Response) => {
        const tool = req.params.tool as string;
        await removeAllowedTool(tool);
        logger.info(`Removed always-allow permission for tool: ${tool}`);
        res.json({ success: true });
    });

    router.get('/files/:id', async (req: Request, res: Response) => {
        const fileId = req.params.id as string;
        const filePath = getFilePath(fileId);

        if (!existsSync(filePath)) {
            res.status(404).json({ error: 'File not found' });
            return;
        }

        try {
            const buffer = await readFileFromDisk(filePath);
            const ext = path.extname(fileId).toLowerCase();
            const mimeMap: Record<string, string> = {
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.pdf': 'application/pdf',
                '.json': 'application/json',
                '.txt': 'text/plain',
                '.csv': 'text/csv',
                '.md': 'text/markdown',
                '.html': 'text/html',
                '.css': 'text/css',
                '.js': 'text/javascript',
                '.ts': 'text/typescript',
                '.xml': 'application/xml',
                '.yaml': 'text/yaml',
                '.yml': 'text/yaml',
            };
            const contentType = mimeMap[ext] || 'application/octet-stream';

            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.send(buffer);
        } catch {
            res.status(500).json({ error: 'Failed to read file' });
        }
    });

    router.post('/chat', async (req: Request, res: Response) => {
        const {
            message,
            medium = 'api',
            cwd,
            attachments: rawAttachments,
        } = req.body as ChatRequest;

        if (!message && (!rawAttachments || rawAttachments.length === 0)) {
            res.status(400).json({ error: 'Message or attachments required' });
            return;
        }

        const fileRefs: FileRef[] = [];
        if (rawAttachments && rawAttachments.length > 0) {
            for (const att of rawAttachments) {
                const buffer = Buffer.from(att.data, 'base64');
                const ref = await saveUpload(buffer, att.name, att.mimeType);
                fileRefs.push(ref);
            }
            logger.info(
                `Received message via ${medium} with ${fileRefs.length} attachment(s)${cwd ? ` from ${cwd}` : ''}`,
            );
        } else {
            logger.info(`Received message via ${medium}${cwd ? ` from ${cwd}` : ''}`);
        }

        agent.setMedium(medium as 'cli' | 'api' | 'voice' | 'sms' | 'slack');

        if (cwd) {
            try {
                await registerWorkspace(cwd, medium);
            } catch (err) {
                logger.warn(`Failed to register workspace: ${(err as Error).message}`);
            }
            const containerCwd = hostToContainer(cwd);
            agent.setCwd(containerCwd);
        }

        let sseStarted = false;
        let heartbeat: NodeJS.Timeout | null = null;

        const startSSEHeartbeat = () => {
            heartbeat = setInterval(() => {
                if (res.closed || res.writableEnded) {
                    if (heartbeat) clearInterval(heartbeat);
                    return;
                }
                try {
                    res.write('data: {}\n\n');
                } catch {
                    if (heartbeat) clearInterval(heartbeat);
                }
            }, 20_000);
        };

        const sendSSE = (msg: Record<string, unknown>) => {
            if (res.closed || res.writableEnded) return;

            if (!sseStarted) {
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                sseStarted = true;
                startSSEHeartbeat();
            }

            try {
                res.write(`data: ${JSON.stringify(msg)}\n\n`);
            } catch {}
        };

        agent.setActivityCallback((activity) => {
            sendSSE({ type: 'activity', data: activity });
        });

        agent.setPermissionCallback(async (activity: ToolActivity) => {
            if (isToolAllowed(activity.tool, activity.args)) {
                return true;
            }

            const id = crypto.randomUUID();
            sendSSE({ type: 'permission', id, data: activity });

            return new Promise<boolean>((resolve) => {
                const timeout = setTimeout(() => {
                    pendingPermissions.delete(id);
                    logger.warn(`Permission ${id} timed out`);
                    resolve(false);
                }, 120000);

                pendingPermissions.set(id, { resolve, timeout });
            });
        });

        try {
            const streamingEnabled = agent.config.settings.streaming;
            const onChunk = streamingEnabled
                ? (chunk: string) => sendSSE({ type: 'chunk', data: chunk })
                : undefined;

            const chatInput =
                fileRefs.length > 0
                    ? { message: message || '', attachments: fileRefs }
                    : message || '';
            const response = await agent.chat(chatInput, onChunk);

            sendSSE({ type: 'done', data: { content: response.content } });

            if (!res.closed && !res.writableEnded) {
                if (sseStarted) {
                    res.end();
                } else {
                    res.status(200).json({ content: response.content });
                }
            }

            logger.info(`Response complete`);
        } catch (error) {
            const err = error as Error;
            logger.error(`Chat error: ${err.message}`);

            if (sseStarted) {
                try {
                    res.write(`data: ${JSON.stringify({ type: 'error', data: err.message })}\n\n`);
                    res.end();
                } catch {}
            } else if (!res.headersSent) {
                res.status(500).json({ error: err.message });
            }
        } finally {
            if (heartbeat) clearInterval(heartbeat);
            agent.setActivityCallback(() => {});
            agent.setPermissionCallback(async () => true);
        }
    });

    router.post('/abort', (req: Request, res: Response) => {
        if (agent.isProcessing()) {
            agent.abort();
            logger.info('Request aborted via /api/abort');
            res.json({ success: true, message: 'Request aborted' });
        } else {
            res.json({ success: true, message: 'No active request to abort' });
        }
    });

    router.post('/compact', async (req: Request, res: Response) => {
        try {
            logger.info('Starting compaction');
            const summary = await agent.performCompaction();
            logger.success('Compaction complete');
            res.json({ success: true, summary });
        } catch (error) {
            const err = error as Error;
            logger.error(`Compaction failed: ${err.message}`);
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/clear', async (req: Request, res: Response) => {
        try {
            logger.info('Clearing conversation history');
            agent.clearHistory();
            res.json({ success: true });
        } catch (error) {
            const err = error as Error;
            logger.error(`Clear failed: ${err.message}`);
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/think', async (req: Request, res: Response) => {
        logger.info('Manual background thinking triggered');

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const sendSSE = (msg: Record<string, unknown>) => {
            if (res.closed || res.writableEnded) return;
            try {
                res.write(`data: ${JSON.stringify(msg)}\n\n`);
            } catch {}
        };

        agent.setActivityCallback((activity) => {
            if (activity.status === 'running') {
                logger.debug(`[think] Tool: ${activity.tool}`);
            } else if (activity.status === 'error') {
                logger.warn(`[think] Tool error: ${activity.tool} - ${activity.error}`);
            }
            sendSSE({ type: 'activity', data: activity });
        });

        try {
            const recentThoughts = await ThinkingRun.getRecent(20);
            const recentLogs = await agent.getRecentBackgroundLogs(6);

            sendSSE({ type: 'status', data: 'Starting background thinking...' });

            const thought = await agent.runBackgroundThinking(
                recentThoughts.map((t) => ({ thought: t.thought, created_at: t.created_at })),
                recentLogs,
            );

            if (thought) {
                const isUrgent = thought.startsWith('[URGENT]');
                const cleanThought = isUrgent ? thought.replace('[URGENT]', '').trim() : thought;

                await ThinkingRun.create({ thought: cleanThought, surfaced: false });

                sendSSE({
                    type: 'done',
                    data: { thought: cleanThought, urgent: isUrgent },
                });
            } else {
                sendSSE({ type: 'done', data: { thought: null } });
            }

            res.end();
        } catch (error) {
            const err = error as Error;
            logger.error(`Think failed: ${err.message}`);
            sendSSE({ type: 'error', data: err.message });
            res.end();
        } finally {
            agent.setActivityCallback(() => {});
        }
    });

    router.post('/reload', async (req: Request, res: Response) => {
        try {
            logger.info('Reloading configuration and skills');
            const newConfig = await loadConfig();
            const result = await agent.reload(newConfig);
            await agent.refreshSkills();
            logger.success(`Reload complete: ${result.mcpTools} MCP tools`);
            res.json({
                success: true,
                mcpTools: result.mcpTools,
                loadedSkills: agent.getLoadedSkillNames(),
            });
        } catch (error) {
            const err = error as Error;
            logger.error(`Reload failed: ${err.message}`);
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/skills/loaded', (req: Request, res: Response) => {
        res.json({ skills: agent.getLoadedSkillNames() });
    });

    router.post('/skills/load', async (req: Request, res: Response) => {
        const { name, args } = req.body as { name: string; args?: string[] };

        if (!name) {
            res.status(400).json({ error: 'Skill name is required' });
            return;
        }

        try {
            const skill = await loadSkill(name);
            if (!skill) {
                res.status(404).json({ error: `Skill not found: ${name}` });
                return;
            }

            agent.loadSkillIntoContext(skill, args || []);
            logger.info(`Loaded skill: ${name}`);

            res.json({
                success: true,
                skill: {
                    name: skill.name,
                    description: skill.metadata.description,
                },
                loadedSkills: agent.getLoadedSkillNames(),
            });
        } catch (error) {
            const err = error as Error;
            logger.error(`Failed to load skill: ${err.message}`);
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/skills/unload', async (req: Request, res: Response) => {
        const { name } = req.body as { name: string };

        if (!name) {
            res.status(400).json({ error: 'Skill name is required' });
            return;
        }

        const unloaded = agent.unloadSkillFromContext(name);
        if (!unloaded) {
            res.status(404).json({ error: `Skill not loaded: ${name}` });
            return;
        }

        logger.info(`Unloaded skill: ${name}`);
        res.json({
            success: true,
            loadedSkills: agent.getLoadedSkillNames(),
        });
    });

    return router;
}
