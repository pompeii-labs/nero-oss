import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import chalk from 'chalk';

export interface ManagedProcess {
    id: string;
    command: string;
    pid: number | null;
    status: 'running' | 'stopped' | 'exited' | 'error';
    exitCode: number | null;
    startedAt: Date;
    stoppedAt: Date | null;
    output: string[];
    maxOutputLines: number;
}

export interface ProcessOptions {
    timeout?: number;
    maxOutputLines?: number;
    cwd?: string;
    env?: Record<string, string>;
}

export class ProcessManager extends EventEmitter {
    private processes: Map<string, ManagedProcess> = new Map();
    private childProcesses: Map<string, ChildProcess> = new Map();
    private idCounter = 0;

    startProcess(command: string, options: ProcessOptions = {}): string {
        const id = `proc_${++this.idCounter}`;
        const maxOutputLines = options.maxOutputLines ?? 500;

        const managed: ManagedProcess = {
            id,
            command,
            pid: null,
            status: 'running',
            exitCode: null,
            startedAt: new Date(),
            stoppedAt: null,
            output: [],
            maxOutputLines,
        };

        this.processes.set(id, managed);

        const env = { ...process.env, ...options.env };
        if (process.env.HOST_HOME) {
            env.HOME = '/host/home';
            env.GIT_DISCOVERY_ACROSS_FILESYSTEM = '1';
        }

        const child = spawn('bash', ['-c', command], {
            cwd: options.cwd,
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        managed.pid = child.pid ?? null;
        this.childProcesses.set(id, child);

        const addOutput = (line: string) => {
            managed.output.push(line);
            if (managed.output.length > maxOutputLines) {
                managed.output.shift();
            }
            this.emit('output', id, line);
        };

        child.stdout?.on('data', (data: Buffer) => {
            const lines = data.toString().split('\n').filter(Boolean);
            lines.forEach(addOutput);
        });

        child.stderr?.on('data', (data: Buffer) => {
            const lines = data.toString().split('\n').filter(Boolean);
            lines.forEach((line) => addOutput(`[stderr] ${line}`));
        });

        child.on('exit', (code, signal) => {
            managed.status = code === 0 ? 'exited' : 'error';
            managed.exitCode = code;
            managed.stoppedAt = new Date();
            this.childProcesses.delete(id);
            this.emit('exit', id, code, signal);
        });

        child.on('error', (err) => {
            managed.status = 'error';
            managed.stoppedAt = new Date();
            addOutput(`[error] ${err.message}`);
            this.childProcesses.delete(id);
            this.emit('error', id, err);
        });

        if (options.timeout) {
            setTimeout(() => {
                if (managed.status === 'running') {
                    this.stopProcess(id);
                    addOutput(`[timeout] Process killed after ${options.timeout}ms`);
                }
            }, options.timeout);
        }

        console.log(chalk.dim(`[process] Started ${id}: ${command} (pid: ${managed.pid})`));
        return id;
    }

    stopProcess(id: string): boolean {
        const child = this.childProcesses.get(id);
        const managed = this.processes.get(id);

        if (!child || !managed) return false;

        child.kill('SIGTERM');
        setTimeout(() => {
            if (this.childProcesses.has(id)) {
                child.kill('SIGKILL');
            }
        }, 5000);

        managed.status = 'stopped';
        managed.stoppedAt = new Date();
        console.log(chalk.dim(`[process] Stopped ${id}`));
        return true;
    }

    getProcess(id: string): ManagedProcess | null {
        return this.processes.get(id) ?? null;
    }

    getOutput(id: string, lines?: number): string[] {
        const managed = this.processes.get(id);
        if (!managed) return [];

        if (lines) {
            return managed.output.slice(-lines);
        }
        return [...managed.output];
    }

    isRunning(id: string): boolean {
        const managed = this.processes.get(id);
        return managed?.status === 'running';
    }

    listProcesses(): ManagedProcess[] {
        return Array.from(this.processes.values());
    }

    listRunning(): ManagedProcess[] {
        return this.listProcesses().filter((p) => p.status === 'running');
    }

    cleanup(): void {
        for (const [id, child] of this.childProcesses) {
            child.kill('SIGKILL');
            const managed = this.processes.get(id);
            if (managed) {
                managed.status = 'stopped';
                managed.stoppedAt = new Date();
            }
        }
        this.childProcesses.clear();
    }
}

export const processManager = new ProcessManager();
