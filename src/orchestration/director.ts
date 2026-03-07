import { v4 as uuidv4 } from 'uuid';
import type { Specialist, SpecialistConfig, SpecialistType } from './specialist.js';
import type { Task, TaskResult } from './task.js';

export interface OrchestrationSession {
    id: string;
    goal: string;
    status: 'planning' | 'executing' | 'completed' | 'failed';
    specialists: Specialist[];
    tasks: Task[];
    results: TaskResult[];
    createdAt: Date;
    updatedAt: Date;
}

export interface DirectorConfig {
    maxSpecialists: number;
    parallelExecution: boolean;
    autoApprove: boolean;
}

/**
 * Director - The conductor of the multi-agent orchestra.
 *
 * Responsible for:
 * 1. Understanding the user's goal
 * 2. Breaking it down into subtasks
 * 3. Spawning appropriate specialists
 * 4. Coordinating execution
 * 5. Synthesizing results
 */
export class Director {
    private sessions: Map<string, OrchestrationSession> = new Map();
    private config: DirectorConfig;

    constructor(config: Partial<DirectorConfig> = {}) {
        this.config = {
            maxSpecialists: 5,
            parallelExecution: true,
            autoApprove: false,
            ...config,
        };
    }

    /**
     * Start a new orchestrated session for a complex goal
     */
    async orchestrate(goal: string): Promise<OrchestrationSession> {
        const session: OrchestrationSession = {
            id: uuidv4(),
            goal,
            status: 'planning',
            specialists: [],
            tasks: [],
            results: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        this.sessions.set(session.id, session);

        // Phase 1: Planning - spawn a Planner specialist to break down the goal
        const planner = await this.spawnSpecialist('planner', session.id);
        const plan = await planner.execute({ goal });

        // Parse the plan into tasks
        session.tasks = this.parsePlanIntoTasks(plan, session.id);
        session.status = 'executing';

        // Phase 2: Execution - spawn specialists for each task
        if (this.config.parallelExecution) {
            await this.executeParallel(session);
        } else {
            await this.executeSequential(session);
        }

        session.status = session.results.every((r) => r.success) ? 'completed' : 'failed';
        session.updatedAt = new Date();

        return session;
    }

    /**
     * Spawn a specialist agent of a specific type
     */
    private async spawnSpecialist(type: SpecialistType, sessionId: string): Promise<Specialist> {
        const config: SpecialistConfig = {
            id: uuidv4(),
            type,
            sessionId,
            capabilities: this.getCapabilitiesForType(type),
        };

        // Dynamic import to avoid circular dependencies
        const { createSpecialist } = await import('./specialist.js');
        const specialist = createSpecialist(config);

        const session = this.sessions.get(sessionId);
        if (session) {
            session.specialists.push(specialist);
        }

        return specialist;
    }

    /**
     * Get the capabilities for a specialist type
     */
    private getCapabilitiesForType(type: SpecialistType): string[] {
        const capabilities: Record<SpecialistType, string[]> = {
            planner: ['task_breakdown', 'dependency_analysis', 'estimation'],
            researcher: ['web_search', 'documentation_analysis', 'synthesis'],
            architect: ['system_design', 'api_design', 'data_modeling'],
            implementer: ['coding', 'testing', 'debugging'],
            reviewer: ['code_review', 'security_audit', 'best_practices'],
            tester: ['test_writing', 'test_execution', 'bug_reporting'],
        };

        return capabilities[type] || [];
    }

    /**
     * Parse a plan into structured tasks
     */
    private parsePlanIntoTasks(plan: unknown, sessionId: string): Task[] {
        // The planner returns a structured plan that we parse into tasks
        if (typeof plan !== 'object' || plan === null) {
            return [];
        }

        const planObj = plan as Record<string, unknown>;
        const steps = planObj.steps;

        if (!Array.isArray(steps)) {
            return [];
        }

        return steps.map((step: unknown, index: number) => ({
            id: uuidv4(),
            sessionId,
            sequence: index + 1,
            description: typeof step === 'string' ? step : String(step),
            status: 'pending',
            dependencies: [],
            specialistType: this.inferSpecialistType(step),
            estimatedDuration: 0,
            result: undefined,
        }));
    }

    /**
     * Infer the best specialist type for a task based on its description
     */
    private inferSpecialistType(taskDescription: unknown): SpecialistType {
        const desc = String(taskDescription).toLowerCase();

        if (desc.includes('research') || desc.includes('investigate') || desc.includes('find')) {
            return 'researcher';
        }
        if (
            desc.includes('design') ||
            desc.includes('architecture') ||
            desc.includes('structure')
        ) {
            return 'architect';
        }
        if (desc.includes('review') || desc.includes('audit') || desc.includes('check')) {
            return 'reviewer';
        }
        if (desc.includes('test') || desc.includes('verify') || desc.includes('validate')) {
            return 'tester';
        }
        if (
            desc.includes('implement') ||
            desc.includes('code') ||
            desc.includes('write') ||
            desc.includes('build')
        ) {
            return 'implementer';
        }

        return 'implementer'; // Default
    }

    /**
     * Execute tasks in parallel where possible
     */
    private async executeParallel(session: OrchestrationSession): Promise<void> {
        const pendingTasks = session.tasks.filter((t) => t.status === 'pending');

        // Group tasks by dependency level
        const levels = this.groupTasksByDependencyLevel(pendingTasks);

        for (const level of levels) {
            // Execute all tasks in this level in parallel
            const promises = level.map((task) => this.executeTask(task, session));
            await Promise.all(promises);
        }
    }

    /**
     * Execute tasks sequentially
     */
    private async executeSequential(session: OrchestrationSession): Promise<void> {
        for (const task of session.tasks) {
            if (task.status === 'pending') {
                await this.executeTask(task, session);
            }
        }
    }

    /**
     * Execute a single task with the appropriate specialist
     */
    private async executeTask(task: Task, session: OrchestrationSession): Promise<void> {
        task.status = 'in_progress';

        // Check if dependencies are met
        const unmetDeps = task.dependencies.filter((depId) => {
            const dep = session.tasks.find((t) => t.id === depId);
            return !dep || dep.status !== 'completed';
        });

        if (unmetDeps.length > 0) {
            task.status = 'blocked';
            return;
        }

        // Spawn specialist for this task
        const specialist = await this.spawnSpecialist(task.specialistType, session.id);

        try {
            const result = await specialist.execute({
                task: task.description,
                context: this.buildTaskContext(task, session),
            });

            task.result = {
                taskId: task.id,
                success: true,
                output: result,
                specialistId: specialist.getId(),
                completedAt: new Date(),
            };

            task.status = 'completed';
            session.results.push(task.result);
        } catch (error) {
            task.result = {
                taskId: task.id,
                success: false,
                output: null,
                error: error instanceof Error ? error.message : String(error),
                specialistId: specialist.getId(),
                completedAt: new Date(),
            };

            task.status = 'failed';
            session.results.push(task.result);
        }
    }

    /**
     * Build context for a task based on completed dependencies
     */
    private buildTaskContext(task: Task, session: OrchestrationSession): Record<string, unknown> {
        const context: Record<string, unknown> = {
            goal: session.goal,
            taskDescription: task.description,
        };

        // Add outputs from dependencies
        for (const depId of task.dependencies) {
            const dep = session.tasks.find((t) => t.id === depId);
            if (dep?.result?.success) {
                context[`dependency_${depId}`] = dep.result.output;
            }
        }

        return context;
    }

    /**
     * Group tasks by their dependency level for parallel execution
     */
    private groupTasksByDependencyLevel(tasks: Task[]): Task[][] {
        const levels: Task[][] = [];
        const completed = new Set<string>();

        while (completed.size < tasks.length) {
            const level = tasks.filter((t) => {
                if (completed.has(t.id)) return false;
                return t.dependencies.every((depId) => completed.has(depId));
            });

            if (level.length === 0) {
                // Circular dependency or orphaned task
                break;
            }

            levels.push(level);
            level.forEach((t) => completed.add(t.id));
        }

        return levels;
    }

    /**
     * Get a session by ID
     */
    getSession(id: string): OrchestrationSession | undefined {
        return this.sessions.get(id);
    }

    /**
     * Get all sessions
     */
    getAllSessions(): OrchestrationSession[] {
        return Array.from(this.sessions.values());
    }

    /**
     * Get session summary
     */
    getSessionSummary(sessionId: string): string {
        const session = this.sessions.get(sessionId);
        if (!session) return 'Session not found';

        const completed = session.results.filter((r) => r.success).length;
        const failed = session.results.filter((r) => !r.success).length;
        const pending = session.tasks.length - session.results.length;

        return `
## Session: ${session.goal}

**Status:** ${session.status}
**Progress:** ${completed} completed, ${failed} failed, ${pending} pending
**Specialists:** ${session.specialists.length}

### Tasks:
${session.tasks.map((t) => `- [${t.status === 'completed' ? 'x' : ' '}] ${t.description} (${t.specialistType})`).join('\n')}

### Results:
${session.results.map((r) => (r.success ? '✓' : '✗')).join(' ')}
    `.trim();
    }
}

// Singleton instance
let director: Director | null = null;

export function getDirector(config?: Partial<DirectorConfig>): Director {
    if (!director) {
        director = new Director(config);
    }
    return director;
}
