import type { SpecialistType } from './specialist.js';

export type TaskStatus = 'pending' | 'in_progress' | 'blocked' | 'completed' | 'failed';

export interface Task {
    id: string;
    sessionId: string;
    sequence: number;
    description: string;
    status: TaskStatus;
    dependencies: string[]; // Task IDs
    specialistType: SpecialistType;
    estimatedDuration: number; // Minutes
    result?: TaskResult;
}

export interface TaskResult {
    taskId: string;
    success: boolean;
    output: unknown;
    error?: string;
    specialistId: string;
    completedAt: Date;
}
