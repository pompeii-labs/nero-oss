import { Goal, Milestone, Task, type GoalStatus, type TaskPriority } from '../models/index.js';
import { db, isDbConnected } from '../db/index.js';

export interface GoalPlan {
    title: string;
    description: string;
    priority: number;
    deadline?: Date;
    tags?: string[];
    milestones: MilestonePlan[];
}

export interface MilestonePlan {
    title: string;
    description: string;
    orderIndex: number;
    deadline?: Date;
    dependencies?: number[]; // Indices of previous milestones
    tasks: TaskPlan[];
}

export interface TaskPlan {
    title: string;
    description: string;
    priority: TaskPriority;
    estimatedHours?: number;
    autonomyEligible: boolean;
    blockedBy?: number[]; // Indices of tasks in this milestone
}

export interface ProgressReport {
    goal: Goal;
    milestones: Milestone[];
    tasks: Task[];
    summary: {
        totalTasks: number;
        completedTasks: number;
        inProgressTasks: number;
        blockedTasks: number;
        pendingTasks: number;
        totalHoursEstimated: number;
        totalHoursActual: number;
        overallProgress: number;
    };
    currentMilestone?: Milestone;
    nextActionableTask?: Task;
    blockedItems: { type: 'milestone' | 'task'; id: number; reason: string }[];
}

export interface DependencyGraph {
    nodes: { id: number; type: 'milestone' | 'task'; title: string; status: string }[];
    edges: { from: number; to: number; type: 'depends_on' | 'blocks' }[];
}

/**
 * Create a new goal with milestones and tasks
 */
export async function createGoal(plan: GoalPlan): Promise<Goal | null> {
    if (!isDbConnected()) return null;

    try {
        await db.query('BEGIN');

        // Create the goal
        const goal = await Goal.create({
            title: plan.title,
            description: plan.description,
            status: 'active',
            priority: plan.priority,
            deadline: plan.deadline,
            current_milestone: 0,
            total_milestones: plan.milestones.length,
            tags: plan.tags || [],
        });

        if (!goal) {
            await db.query('ROLLBACK');
            return null;
        }

        // Create milestones and tasks
        for (const m of plan.milestones) {
            const milestone = await Milestone.create({
                goal_id: goal.id,
                title: m.title,
                description: m.description,
                status: m.orderIndex === 0 ? 'in_progress' : 'pending',
                order_index: m.orderIndex,
                dependencies: m.dependencies || [],
                deadline: m.deadline,
            });

            if (!milestone) continue;

            // Create tasks for this milestone
            for (const t of m.tasks) {
                await Task.create({
                    milestone_id: milestone.id,
                    goal_id: goal.id,
                    title: t.title,
                    description: t.description,
                    status: 'pending',
                    priority: t.priority,
                    blocked_by: t.blockedBy || [],
                    estimated_hours: t.estimatedHours,
                    actual_hours: 0,
                    autonomy_eligible: t.autonomyEligible,
                });
            }
        }

        await db.query('COMMIT');
        return goal;
    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Failed to create goal:', error);
        return null;
    }
}

/**
 * Get a complete progress report for a goal
 */
export async function getProgressReport(goalId: number): Promise<ProgressReport | null> {
    if (!isDbConnected()) return null;

    const goal = await Goal.getById(goalId);
    if (!goal) return null;

    const milestones = await Milestone.getByGoal(goalId);
    const tasks = await Task.getByGoal(goalId);

    // Calculate summary stats
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'completed').length;
    const inProgressTasks = tasks.filter((t) => t.status === 'in_progress').length;
    const blockedTasks = tasks.filter((t) => t.status === 'blocked').length;
    const pendingTasks = tasks.filter((t) => t.status === 'pending').length;

    const totalHoursEstimated = tasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
    const totalHoursActual = tasks.reduce((sum, t) => sum + t.actual_hours, 0);

    // Find current milestone
    const currentMilestone = milestones.find((m) => m.status === 'in_progress');

    // Find next actionable task (pending, not blocked, in active milestone)
    const nextActionableTask = tasks.find((t) => {
        if (t.status !== 'pending') return false;
        const m = milestones.find((m) => m.id === t.milestone_id);
        return m?.status === 'in_progress' || m?.status === 'pending';
    });

    // Find blocked items
    const blockedItems: { type: 'milestone' | 'task'; id: number; reason: string }[] = [];

    for (const m of milestones) {
        if (m.status === 'blocked') {
            const check = await m.checkDependencies();
            blockedItems.push({
                type: 'milestone',
                id: m.id,
                reason: `Waiting for ${check.blocking.length} dependencies`,
            });
        }
    }

    for (const t of tasks) {
        if (t.status === 'blocked') {
            const check = await t.checkBlockers();
            blockedItems.push({
                type: 'task',
                id: t.id,
                reason: `Blocked by ${check.blockers.length} task(s)`,
            });
        }
    }

    const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
        goal,
        milestones,
        tasks,
        summary: {
            totalTasks,
            completedTasks,
            inProgressTasks,
            blockedTasks,
            pendingTasks,
            totalHoursEstimated,
            totalHoursActual,
            overallProgress,
        },
        currentMilestone,
        nextActionableTask,
        blockedItems,
    };
}

/**
 * Advance to the next milestone when current is complete
 */
export async function advanceMilestone(
    goalId: number,
): Promise<{ success: boolean; message: string }> {
    if (!isDbConnected()) return { success: false, message: 'Database not connected' };

    const goal = await Goal.getById(goalId);
    if (!goal) return { success: false, message: 'Goal not found' };

    const milestones = await Milestone.getByGoal(goalId);
    const current = milestones.find((m) => m.status === 'in_progress');

    if (!current) {
        // Check if we're done
        const allCompleted = milestones.every((m) => m.status === 'completed');
        if (allCompleted) {
            await goal.complete();
            return { success: true, message: 'Goal completed! All milestones finished.' };
        }
        return { success: false, message: 'No milestone currently in progress' };
    }

    // Complete current milestone
    await current.complete();

    // Find next milestone
    const next = milestones
        .filter((m) => m.status === 'pending' && m.order_index > current.order_index)
        .sort((a, b) => a.order_index - b.order_index)[0];

    if (!next) {
        // Check if all done
        const allCompleted = milestones.every((m) => m.status === 'completed');
        if (allCompleted) {
            await goal.complete();
            return { success: true, message: 'Goal completed! All milestones finished.' };
        }
        return {
            success: true,
            message: 'Current milestone completed. No more milestones pending.',
        };
    }

    // Check if next milestone's dependencies are met
    const deps = await next.checkDependencies();
    if (!deps.met) {
        await next.block();
        return {
            success: true,
            message: `Milestone '${current.title}' completed. Next milestone '${next.title}' is blocked by ${deps.blocking.length} dependencies.`,
        };
    }

    // Start next milestone
    await next.start();
    await goal.updateProgress(goal.current_milestone + 1);

    return {
        success: true,
        message: `Milestone '${current.title}' completed. Now working on: ${next.title}`,
    };
}

/**
 * Get tasks that Nero can work on autonomously
 */
export async function getAutonomyTasks(): Promise<Task[]> {
    return Task.getAutonomyEligible();
}

/**
 * Check and update blocked status for all tasks and milestones
 */
export async function checkAllDependencies(): Promise<{
    unblockedMilestones: number;
    unblockedTasks: number;
    newlyBlocked: number;
}> {
    if (!isDbConnected()) return { unblockedMilestones: 0, unblockedTasks: 0, newlyBlocked: 0 };

    let unblockedMilestones = 0;
    let unblockedTasks = 0;
    let newlyBlocked = 0;

    // Check milestones
    const blockedMilestones = await Milestone.getBlocked();
    for (const m of blockedMilestones) {
        const check = await m.checkDependencies();
        if (check.met) {
            await m.unblock();
            unblockedMilestones++;
        }
    }

    // Check tasks
    const blockedTasks = await Task.getBlocked();
    for (const t of blockedTasks) {
        const check = await t.checkBlockers();
        if (check.blocked) {
            newlyBlocked++;
        } else {
            await t.unblock();
            unblockedTasks++;
        }
    }

    return { unblockedMilestones, unblockedTasks, newlyBlocked };
}

/**
 * Get all active goals with their current status
 */
export async function getActiveGoalsOverview(): Promise<
    {
        goal: Goal;
        progress: number;
        currentMilestone?: string;
        tasksDone: number;
        totalTasks: number;
        daysUntilDeadline: number | null;
    }[]
> {
    if (!isDbConnected()) return [];

    const goals = await Goal.getActive();
    const overview = [];

    for (const goal of goals) {
        const report = await getProgressReport(goal.id);
        if (!report) continue;

        overview.push({
            goal,
            progress: report.summary.overallProgress,
            currentMilestone: report.currentMilestone?.title,
            tasksDone: report.summary.completedTasks,
            totalTasks: report.summary.totalTasks,
            daysUntilDeadline: goal.daysUntilDeadline,
        });
    }

    return overview;
}

/**
 * Build a dependency graph for visualization
 */
export async function buildDependencyGraph(goalId: number): Promise<DependencyGraph | null> {
    if (!isDbConnected()) return null;

    const milestones = await Milestone.getByGoal(goalId);
    const tasks = await Task.getByGoal(goalId);

    const nodes: DependencyGraph['nodes'] = [];
    const edges: DependencyGraph['edges'] = [];

    // Add milestone nodes
    for (const m of milestones) {
        nodes.push({
            id: m.id,
            type: 'milestone',
            title: m.title,
            status: m.status,
        });

        // Add milestone dependencies
        for (const depId of m.dependencies) {
            edges.push({ from: depId, to: m.id, type: 'depends_on' });
        }
    }

    // Add task nodes
    for (const t of tasks) {
        nodes.push({
            id: t.id + 10000, // Offset to avoid collision with milestone IDs
            type: 'task',
            title: t.title,
            status: t.status,
        });

        // Add task dependencies
        for (const blockerId of t.blocked_by) {
            edges.push({ from: blockerId + 10000, to: t.id + 10000, type: 'blocks' });
        }
    }

    return { nodes, edges };
}

/**
 * Archive completed goals older than a certain date
 */
export async function archiveOldGoals(daysOld: number = 30): Promise<number> {
    if (!isDbConnected()) return 0;

    const { rowCount } = await db.query(
        `UPDATE goals 
         SET status = 'abandoned', updated_at = NOW()
         WHERE status = 'completed' 
         AND updated_at < NOW() - INTERVAL '${daysOld} days'`,
    );

    return rowCount || 0;
}

/**
 * Get goals that need attention (overdue, blocked, or stuck)
 */
export async function getGoalsNeedingAttention(): Promise<
    {
        goal: Goal;
        issues: { type: 'overdue' | 'blocked' | 'stuck'; details: string }[];
    }[]
> {
    if (!isDbConnected()) return [];

    const attention: {
        goal: Goal;
        issues: { type: 'overdue' | 'blocked' | 'stuck'; details: string }[];
    }[] = [];

    // Check overdue goals
    const overdue = await Goal.getOverdue();
    for (const goal of overdue) {
        const days = goal.daysUntilDeadline;
        attention.push({
            goal,
            issues: [{ type: 'overdue', details: `${days && Math.abs(days)} days overdue` }],
        });
    }

    // Check blocked milestones
    const blockedMilestones = await Milestone.getBlocked();
    const blockedByGoal = new Map<number, string[]>();
    for (const m of blockedMilestones) {
        const goal = await m.getGoal();
        if (goal) {
            const existing = blockedByGoal.get(goal.id) || [];
            existing.push(m.title);
            blockedByGoal.set(goal.id, existing);
        }
    }

    for (const [goalId, milestones] of blockedByGoal) {
        const goal = await Goal.getById(goalId);
        if (goal && !overdue.find((g) => g.id === goalId)) {
            const existing = attention.find((a) => a.goal.id === goalId);
            if (existing) {
                existing.issues.push({
                    type: 'blocked',
                    details: `${milestones.length} blocked milestone(s): ${milestones.join(', ')}`,
                });
            } else {
                attention.push({
                    goal,
                    issues: [
                        {
                            type: 'blocked',
                            details: `${milestones.length} blocked milestone(s): ${milestones.join(', ')}`,
                        },
                    ],
                });
            }
        }
    }

    // Check stuck tasks (in progress for too long)
    const { rows } = await db.query(
        `SELECT t.*, g.title as goal_title, g.id as goal_id
         FROM tasks t
         JOIN milestones m ON t.milestone_id = m.id
         JOIN goals g ON t.goal_id = g.id
         WHERE t.status = 'in_progress'
         AND t.actual_hours > COALESCE(t.estimated_hours, 1) * 3
         AND g.status = 'active'`,
    );

    for (const row of rows) {
        const goalId = row.goal_id;
        const existing = attention.find((a) => a.goal.id === goalId);
        if (existing) {
            existing.issues.push({
                type: 'stuck',
                details: `Task "${row.title}" is taking ${Math.round(row.actual_hours)}h (estimated ${row.estimated_hours}h)`,
            });
        } else {
            const goal = await Goal.getById(goalId);
            if (goal) {
                attention.push({
                    goal,
                    issues: [
                        {
                            type: 'stuck',
                            details: `Task "${row.title}" is taking ${Math.round(row.actual_hours)}h (estimated ${row.estimated_hours}h)`,
                        },
                    ],
                });
            }
        }
    }

    return attention;
}
