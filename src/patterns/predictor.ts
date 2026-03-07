import { db, isDbConnected } from '../db/index.js';
import { Pattern, Prediction } from '../models/pattern.js';
import type { NeroConfig } from '../config.js';

export interface Suggestion {
    id: number;
    action: string;
    context?: string;
    confidence: number;
    reason: string;
}

/**
 * Check if we should make a suggestion based on current context
 */
export async function generateSuggestions(config: NeroConfig): Promise<Suggestion[]> {
    if (!isDbConnected()) return [];

    const suggestions: Suggestion[] = [];
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();

    // Check temporal patterns
    const temporalSuggestions = await checkTemporalPatterns(hour, dayOfWeek);
    suggestions.push(...temporalSuggestions);

    // Check for sequential patterns (what user typically does next)
    const sequentialSuggestions = await checkSequentialPatterns();
    suggestions.push(...sequentialSuggestions);

    // Filter by confidence threshold and return top suggestions
    const threshold = config.proactivity?.confidenceThreshold ?? 0.6;
    return suggestions
        .filter((s) => s.confidence >= threshold)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3);
}

async function checkTemporalPatterns(hour: number, dayOfWeek: number): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];

    // Morning routine detection (8am-10am on weekdays)
    if (hour >= 8 && hour <= 10 && dayOfWeek >= 1 && dayOfWeek <= 5) {
        const morningPatterns = await Pattern.list({
            where: { type: 'temporal', status: 'active' },
            orderBy: { column: 'confidence', direction: 'DESC' },
        });

        for (const pattern of morningPatterns) {
            if (pattern.trigger.includes('morning') || pattern.trigger.startsWith(`${hour}:`)) {
                suggestions.push({
                    id: pattern.id,
                    action: pattern.action,
                    context: pattern.context,
                    confidence: pattern.confidence,
                    reason: `You usually ${getActionDescription(pattern.action)} in the morning`,
                });
            }
        }
    }

    // End of day patterns (after 4pm)
    if (hour >= 16 && hour <= 18) {
        const eodPatterns = await Pattern.list({
            where: { type: 'temporal', status: 'active' },
        });

        for (const pattern of eodPatterns) {
            if (pattern.trigger.includes('evening') || parseInt(pattern.trigger) >= 16) {
                suggestions.push({
                    id: pattern.id,
                    action: pattern.action,
                    context: pattern.context,
                    confidence: pattern.confidence * 0.9, // Slightly lower confidence for EOD
                    reason: `End of day routine: ${getActionDescription(pattern.action)}`,
                });
            }
        }
    }

    return suggestions;
}

async function checkSequentialPatterns(): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];

    // Get recent user activity from background logs
    const { rows } = await db.query(
        `SELECT tool_name FROM background_logs 
         WHERE created_at > NOW() - INTERVAL '30 minutes'
         ORDER BY created_at DESC LIMIT 10`,
    );

    const recentTools = rows.map((r) => r.tool_name);

    if (recentTools.length === 0) return [];

    // Look for patterns where the recent tool is the trigger
    const sequentialPatterns = await Pattern.list({
        where: { type: 'sequential', status: 'active' },
    });

    for (const pattern of sequentialPatterns) {
        // Check if user just did the trigger action
        const triggerTool = pattern.trigger.replace(/_/g, ':');
        if (recentTools.some((tool) => tool?.includes(triggerTool) || triggerTool.includes(tool))) {
            suggestions.push({
                id: pattern.id,
                action: pattern.action,
                confidence: pattern.confidence,
                reason: `After ${getActionDescription(pattern.trigger)}, you usually ${getActionDescription(pattern.action)}`,
            });
        }
    }

    return suggestions;
}

function getActionDescription(action: string): string {
    const descriptions: Record<string, string> = {
        check_calendar: 'check your calendar',
        check_time: 'check the time',
        git_status: 'check git status',
        git_commit: 'commit changes',
        git_push: 'push commits',
        run_tests: 'run tests',
        deploy: 'deploy',
        build: 'build the project',
        check_email: 'check email',
        check_messages: 'check messages',
        control_lights: 'adjust the lights',
        control_music: 'control music',
        control_climate: 'adjust the temperature',
        web_search: 'search the web',
        check_weather: 'check the weather',
        sync_codebase: 'sync the codebase',
    };

    return descriptions[action] || action.replace(/_/g, ' ');
}

/**
 * Store a prediction for later evaluation
 */
export async function recordPrediction(
    patternId: number,
    action: string,
    context?: string,
    confidence: number = 0.5,
): Promise<void> {
    if (!isDbConnected()) return;

    await Prediction.create({
        pattern_id: patternId,
        predicted_action: action,
        context,
        confidence,
        triggered_at: new Date(),
        presented: false,
    });
}

/**
 * Format suggestions for display to the user
 */
export function formatSuggestions(suggestions: Suggestion[]): string {
    if (suggestions.length === 0) return '';

    const lines = suggestions.map((s, i) => {
        const confidencePct = Math.round(s.confidence * 100);
        return `${i + 1}. ${getActionDescription(s.action)} (${confidencePct}% confidence)`;
    });

    return `Based on your patterns, you might want to:\n${lines.join('\n')}`;
}
