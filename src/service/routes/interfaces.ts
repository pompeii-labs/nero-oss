import { Router, Request, Response } from 'express';
import { spawn, type ChildProcess } from 'child_process';
import { Nero } from '../../agent/nero.js';
import { InterfaceManager } from '../../interfaces/manager.js';
import type { InterfaceAction } from '../../interfaces/types.js';
import { Logger } from '../../util/logger.js';

const MAX_BUFFER = 50 * 1024;
const runningProcesses = new Map<string, ChildProcess>();

export async function executeAction(
    agent: Nero,
    manager: InterfaceManager,
    interfaceId: string,
    action: InterfaceAction,
    logger: Logger,
): Promise<{ success: boolean; result?: string; error?: string }> {
    switch (action.type) {
        case 'tool': {
            let args = action.args || {};
            if (typeof args === 'string') {
                try {
                    args = JSON.parse(args);
                } catch {
                    args = {};
                }
            }
            const result = await agent.callMcpTool(action.toolName, args);
            return { success: true, result };
        }
        case 'command': {
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);
            const result = await execAsync(action.command, { timeout: 30_000 });
            return { success: true, result: result.stdout || result.stderr };
        }
        case 'update': {
            manager.updateState(interfaceId, action.stateKey, action.value);
            return { success: true };
        }
        case 'stream': {
            const processKey = `${interfaceId}:${action.stateKey}`;
            const existing = runningProcesses.get(processKey);
            if (existing) {
                try {
                    existing.kill('SIGTERM');
                } catch {}
                runningProcesses.delete(processKey);
            }

            manager.updateState(interfaceId, `${action.stateKey}_status`, 'running');
            manager.updateState(interfaceId, action.stateKey, '');

            let buffer = '';
            const child = spawn('sh', ['-c', action.command], {
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            runningProcesses.set(processKey, child);

            const appendToBuffer = (chunk: Buffer) => {
                buffer += chunk.toString();
                if (buffer.length > MAX_BUFFER) {
                    buffer = buffer.slice(buffer.length - MAX_BUFFER);
                }
                manager.updateState(interfaceId, action.stateKey, buffer);
            };

            child.stdout?.on('data', appendToBuffer);
            child.stderr?.on('data', appendToBuffer);

            child.on('close', (code) => {
                runningProcesses.delete(processKey);
                manager.updateState(
                    interfaceId,
                    `${action.stateKey}_status`,
                    code === 0 ? 'complete' : 'error',
                );
                manager.updateState(interfaceId, `${action.stateKey}_code`, code);
            });

            child.on('error', (err) => {
                runningProcesses.delete(processKey);
                buffer += `\n${err.message}`;
                manager.updateState(interfaceId, action.stateKey, buffer);
                manager.updateState(interfaceId, `${action.stateKey}_status`, 'error');
            });

            return { success: true };
        }
        case 'kill': {
            const killKey = `${interfaceId}:${action.stateKey}`;
            const proc = runningProcesses.get(killKey);
            if (proc) {
                try {
                    proc.kill('SIGTERM');
                } catch {}
                runningProcesses.delete(killKey);
                manager.updateState(interfaceId, `${action.stateKey}_status`, 'killed');
            }
            return { success: true };
        }
        default:
            return { success: false, error: 'Unknown action type' };
    }
}

export function killAllProcessesForInterface(interfaceId: string): void {
    for (const [key, proc] of runningProcesses) {
        if (key.startsWith(`${interfaceId}:`)) {
            try {
                proc.kill('SIGTERM');
            } catch {}
            runningProcesses.delete(key);
        }
    }
}

export function createInterfacesRouter(agent: Nero, manager: InterfaceManager) {
    const router = Router();
    const logger = new Logger('Interfaces');

    manager.setActionExecutor(async (interfaceId, action) => {
        try {
            await executeAction(agent, manager, interfaceId, action, logger);
        } catch (error) {
            logger.error(`Trigger action error: ${(error as Error).message}`);
        }
    });

    manager.subscribeGlobal((event) => {
        if (event.type === 'closed') {
            killAllProcessesForInterface(event.id);
        }
    });

    router.get('/presence', (_req: Request, res: Response) => {
        res.json({ display: agent.getActiveDisplay() });
    });

    router.post('/presence', (req: Request, res: Response) => {
        const { display } = req.body;
        if (!display || typeof display !== 'string') {
            res.status(400).json({ error: 'display is required' });
            return;
        }

        agent.setActiveDisplay(display);

        if (agent.isWebVoiceActive()) {
            agent.setVoiceDevice(display);
            manager.emitVoiceMigrate(display);

            if (agent.voiceManager) {
                agent.voiceManager.startMigration();
            }

            for (const iface of manager.list()) {
                manager.moveToDevice(iface.id, display);
            }
        }

        res.json({ display });
    });

    router.get('/interfaces/events', (req: Request, res: Response) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const deviceId = req.query.device as string | undefined;
        const deviceName = req.query.name as string | undefined;

        manager.addWebClient();

        const heartbeat = setInterval(() => {
            if (res.closed || res.writableEnded) {
                clearInterval(heartbeat);
                return;
            }
            try {
                res.write('data: {}\n\n');
            } catch {
                clearInterval(heartbeat);
            }
        }, 20_000);

        const unsubscribe = manager.subscribeGlobal((event) => {
            if (res.closed || res.writableEnded) return;

            if (deviceId && event.type === 'opened') {
                const target = event.iface.targetDevice;
                if (target && target !== deviceName && target !== deviceId) return;
            }

            if (deviceId && event.type === 'moved') {
                const isSource = event.fromDevice === deviceName || event.fromDevice === deviceId;
                const isTarget = event.toDevice === deviceName || event.toDevice === deviceId;
                if (!isSource && !isTarget) return;
            }

            if (deviceId && event.type === 'ambient_suppress') {
                if (event.displayName !== deviceName && event.displayName !== deviceId) return;
            }

            if (deviceId && event.type === 'ambient_restore') {
                if (event.displayName !== deviceName && event.displayName !== deviceId) return;
            }

            try {
                res.write(`data: ${JSON.stringify(event)}\n\n`);
            } catch {}
        });

        if (deviceId) {
            manager.registerDevice(deviceId, deviceName || deviceId);
        }

        req.on('close', () => {
            clearInterval(heartbeat);
            unsubscribe();
            if (deviceId) {
                manager.unregisterDevice(deviceId);
            }
            manager.removeWebClient();
        });
    });

    router.get('/interfaces/devices', (_req: Request, res: Response) => {
        res.json(manager.getDevices());
    });

    router.get('/interfaces', (_req: Request, res: Response) => {
        res.json(manager.list());
    });

    router.get('/interfaces/:id', (req: Request, res: Response) => {
        const id = req.params.id as string;
        const iface = manager.get(id);
        if (!iface) {
            res.status(404).json({ error: 'Interface not found' });
            return;
        }
        res.json(iface);
    });

    router.post('/interfaces/:id/action', async (req: Request, res: Response) => {
        const id = req.params.id as string;
        const iface = manager.get(id);
        if (!iface) {
            res.status(404).json({ error: 'Interface not found' });
            return;
        }

        const action = req.body as InterfaceAction;
        if (!action || !action.type) {
            res.status(400).json({ error: 'Action required' });
            return;
        }

        try {
            const result = await executeAction(agent, manager, id, action, logger);
            if (result.success) {
                res.json(result);
            } else {
                res.status(400).json(result);
            }
        } catch (error) {
            logger.error(`Action error: ${(error as Error).message}`);
            res.status(500).json({ error: (error as Error).message });
        }
    });

    router.get('/interfaces/:id/events', (req: Request, res: Response) => {
        const id = req.params.id as string;
        const iface = manager.get(id);
        if (!iface) {
            res.status(404).json({ error: 'Interface not found' });
            return;
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const heartbeat = setInterval(() => {
            if (res.closed || res.writableEnded) {
                clearInterval(heartbeat);
                return;
            }
            try {
                res.write('data: {}\n\n');
            } catch {
                clearInterval(heartbeat);
            }
        }, 20_000);

        const unsubscribe = manager.subscribe(id, (event) => {
            if (res.closed || res.writableEnded) return;
            try {
                res.write(`data: ${JSON.stringify(event)}\n\n`);
            } catch {}
        });

        req.on('close', () => {
            clearInterval(heartbeat);
            unsubscribe();
        });
    });

    return router;
}
