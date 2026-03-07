import type { TaskResult } from './task.js';
import type { SubagentTask } from '../agent/subagent.js';

export type SpecialistType =
    | 'planner'
    | 'researcher'
    | 'architect'
    | 'implementer'
    | 'reviewer'
    | 'tester';

export interface SpecialistConfig {
    id: string;
    type: SpecialistType;
    sessionId: string;
    capabilities: string[];
}

export interface SpecialistMessage {
    from: string;
    to: string;
    type: 'request' | 'response' | 'broadcast';
    content: unknown;
    timestamp: Date;
}

/**
 * Base class for all specialist agents.
 *
 * Specialists are lightweight subagents that focus on a specific domain.
 * They communicate through the message bus and report back to the Director.
 */
export abstract class Specialist {
    protected config: SpecialistConfig;
    protected messageHistory: SpecialistMessage[] = [];

    constructor(config: SpecialistConfig) {
        this.config = config;
    }

    getId(): string {
        return this.config.id;
    }

    getType(): SpecialistType {
        return this.config.type;
    }

    getCapabilities(): string[] {
        return this.config.capabilities;
    }

    /**
     * Execute the specialist's core function
     */
    abstract execute(context: Record<string, unknown>): Promise<unknown>;

    /**
     * Receive a message from another specialist
     */
    receiveMessage(message: SpecialistMessage): void {
        this.messageHistory.push(message);
    }

    /**
     * Send a message to another specialist
     */
    async sendMessage(to: string, content: unknown): Promise<void> {
        const message: SpecialistMessage = {
            from: this.config.id,
            to,
            type: 'request',
            content,
            timestamp: new Date(),
        };

        // In a real implementation, this would go through a message bus
        // For now, we'll store it locally
        this.messageHistory.push(message);
    }

    /**
     * Get the specialist's system prompt based on its type
     */
    protected getSystemPrompt(): string {
        const prompts: Record<SpecialistType, string> = {
            planner: `You are a Planner specialist agent. Your job is to break down complex goals into actionable steps.

When given a goal:
1. Analyze what needs to be done
2. Identify dependencies between tasks
3. Estimate effort for each task
4. Output a structured plan

Output format:
{
  "steps": [
    {"order": 1, "description": "...", "dependencies": [], "estimatedMinutes": 30},
    ...
  ],
  "summary": "brief description of the approach"
}`,

            researcher: `You are a Researcher specialist agent. Your job is to gather information and synthesize findings.

When given a research task:
1. Search for relevant information
2. Analyze and verify sources
3. Synthesize key findings
4. Cite your sources

Output format:
{
  "findings": [...],
  "sources": [...],
  "confidence": "high|medium|low",
  "recommendations": [...]
}`,

            architect: `You are an Architect specialist agent. Your job is to design system structures and APIs.

When given a design task:
1. Analyze requirements
2. Design the system structure
3. Define interfaces and data models
4. Consider scalability and maintainability

Output format:
{
  "design": {
    "components": [...],
    "interfaces": [...],
    "dataModels": [...],
    "diagram": "text description or mermaid"
  },
  "rationale": "why this design was chosen"
}`,

            implementer: `You are an Implementer specialist agent. Your job is to write code and implement solutions.

When given an implementation task:
1. Understand the requirements
2. Write clean, tested code
3. Follow best practices
4. Include error handling

Output format:
{
  "files": [
    {"path": "...", "content": "..."}
  ],
  "tests": [...],
  "notes": "any important implementation details"
}`,

            reviewer: `You are a Reviewer specialist agent. Your job is to review code and designs for quality.

When given a review task:
1. Check for correctness
2. Identify potential bugs
3. Assess code quality
4. Verify security considerations

Output format:
{
  "issues": [
    {"severity": "critical|warning|suggestion", "message": "...", "location": "..."}
  ],
  "quality": "excellent|good|needs_work",
  "approvable": true|false,
  "feedback": "overall assessment"
}`,

            tester: `You are a Tester specialist agent. Your job is to write and execute tests.

When given a testing task:
1. Identify test scenarios
2. Write comprehensive test cases
3. Execute tests
4. Report results

Output format:
{
  "testCases": [
    {"name": "...", "input": {...}, "expected": {...}, "type": "unit|integration|e2e"}
  ],
  "coverage": {...},
  "results": {...}
}`,
        };

        return prompts[this.config.type] || 'You are a specialist agent.';
    }
}

/**
 * Factory function to create the appropriate specialist instance
 */
export function createSpecialist(config: SpecialistConfig): Specialist {
    // For now, we return a base implementation
    // In the future, this could return specialized subclasses
    return new GenericSpecialist(config);
}

/**
 * Generic specialist implementation that uses the subagent system
 */
class GenericSpecialist extends Specialist {
    async execute(context: Record<string, unknown>): Promise<unknown> {
        const { getConfig } = await import('../config.js');
        const config = getConfig();

        // Build the task description from context
        const taskDescription = this.buildTaskDescription(context);

        // Determine mode based on specialist type
        const mode: 'research' | 'build' =
            this.config.type === 'implementer' || this.config.type === 'tester'
                ? 'build'
                : 'research';

        // Create subagent task
        const subagentTask: SubagentTask = {
            id: this.config.id,
            task: taskDescription,
            mode,
            model: config.llm.model,
        };

        // Create OpenAI client for subagent
        const OpenAI = (await import('openai')).default;
        const client = new OpenAI({
            baseURL: config.llm.baseUrl,
            apiKey: process.env.OPENROUTER_API_KEY || '',
            timeout: 120_000,
            defaultHeaders: {
                'X-Title': `Nero-${this.config.type}`,
                'HTTP-Referer': 'https://nero.pompeiilabs.com',
            },
        });

        // Run the subagent
        const { runSubagent } = await import('../agent/subagent.js');
        const result = await runSubagent({
            task: subagentTask,
            model: config.llm.model,
            client,
            cwd: process.cwd(),
        });

        // Try to parse structured result from the subagent
        try {
            // Look for JSON blocks in the result
            const jsonMatch = result.match(/```json\n?([\s\S]*?)\n?```/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[1]);
            }

            // Try to parse the whole thing as JSON
            const parsed = JSON.parse(result);
            return parsed;
        } catch {
            // Return as plain text wrapped in a structure
            return {
                type: this.config.type,
                raw_output: result,
                timestamp: new Date().toISOString(),
            };
        }
    }

    private buildTaskDescription(context: Record<string, unknown>): string {
        const goal = context.goal as string;
        const taskDesc = context.taskDescription as string;

        const prompts: Record<SpecialistType, string> = {
            planner: `You are a Planner specialist. Your task is to create a detailed plan for the following goal.

Goal: ${goal}

Break this down into actionable steps. Output your plan as a JSON object with this structure:
{
  "steps": [
    {"order": 1, "description": "specific task", "dependencies": [], "estimatedMinutes": 30, "specialistType": "researcher|architect|implementer|reviewer|tester"}
  ],
  "summary": "brief description of the approach"
}

Be specific about dependencies - list the order numbers of steps that must complete before this one can start.`,

            researcher: `You are a Researcher specialist. Your task is to investigate the following topic.

Goal: ${goal}
Task: ${taskDesc}

Research thoroughly and provide your findings as a JSON object:
{
  "findings": ["key finding 1", "key finding 2"],
  "sources": ["source 1", "source 2"],
  "confidence": "high|medium|low",
  "recommendations": ["recommendation 1"]
}`,

            architect: `You are an Architect specialist. Your task is to design a system or solution.

Goal: ${goal}
Task: ${taskDesc}

Design the solution and output as JSON:
{
  "design": {
    "components": ["component 1", "component 2"],
    "interfaces": ["interface 1"],
    "dataModels": ["model description"],
    "diagram": "text description or mermaid"
  },
  "rationale": "why this design was chosen"
}`,

            implementer: `You are an Implementer specialist. Your task is to write code.

Goal: ${goal}
Task: ${taskDesc}

Implement the solution. Output as JSON:
{
  "files": [
    {"path": "relative/path.ts", "content": "full file content"}
  ],
  "tests": ["test description 1"],
  "notes": "important implementation details"
}`,

            reviewer: `You are a Reviewer specialist. Your task is to review code or design.

Goal: ${goal}
Task: ${taskDesc}

Review thoroughly and output as JSON:
{
  "issues": [
    {"severity": "critical|warning|suggestion", "message": "...", "location": "file:line"}
  ],
  "quality": "excellent|good|needs_work",
  "approvable": true|false,
  "feedback": "overall assessment"
}`,

            tester: `You are a Tester specialist. Your task is to write and plan tests.

Goal: ${goal}
Task: ${taskDesc}

Design tests and output as JSON:
{
  "testCases": [
    {"name": "...", "input": {...}, "expected": {...}, "type": "unit|integration|e2e"}
  ],
  "coverage": {"description": "what areas are covered"},
  "results": {"status": "planned"}
}`,
        };

        return prompts[this.config.type] || `Task: ${taskDesc}\n\nGoal context: ${goal}`;
    }
}
