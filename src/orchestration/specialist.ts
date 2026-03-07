import type { TaskResult } from './task.js';

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
 * Generic specialist implementation that uses the base functionality
 */
class GenericSpecialist extends Specialist {
    async execute(context: Record<string, unknown>): Promise<unknown> {
        // This is a placeholder implementation
        // In the real implementation, this would:
        // 1. Use the dispatch tool to spawn a subagent
        // 2. Pass the appropriate system prompt
        // 3. Return the structured result

        return {
            type: this.config.type,
            context,
            message: `Specialist ${this.config.type} would execute here`,
            note: 'This is a foundation implementation. Full subagent dispatch integration coming next.',
        };
    }
}
