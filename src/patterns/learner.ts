import { db, isDbConnected } from '../db/index.js';
import { Pattern, type PatternType, type PatternData } from '../models/pattern.js';
import { Message } from '../models/message.js';

export interface DetectedPattern {
    type: PatternType;
    trigger: string;
    action: string;
    context?: string;
    confidence: number;
}

// Keywords that suggest temporal patterns
const TEMPORAL_KEYWORDS = [
    'morning',
    'afternoon',
    'evening',
    'night',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
    'today',
    'tomorrow',
    'yesterday',
    'daily',
    'weekly',
    '9am',
    '10am',
    '11am',
    '12pm',
    '1pm',
    '2pm',
    '3pm',
    '4pm',
    '5pm',
    '6pm',
    '7pm',
    '8pm',
    '9pm',
    '10pm',
];

// Command patterns that suggest actions
const COMMAND_PATTERNS = [
    // Calendar/time
    { regex: /calendar|schedule|events?|meetings?/i, action: 'check_calendar' },
    { regex: /time|what time|current time/i, action: 'check_time' },

    // Development
    { regex: /git status|status/i, action: 'git_status' },
    { regex: /commit/i, action: 'git_commit' },
    { regex: /push/i, action: 'git_push' },
    { regex: /test|run tests/i, action: 'run_tests' },
    { regex: /deploy|deployment/i, action: 'deploy' },
    { regex: /build|compile/i, action: 'build' },

    // Communication
    { regex: /email|emails|inbox/i, action: 'check_email' },
    { regex: /messages?|slack|pompeii/i, action: 'check_messages' },

    // Smart home (if configured)
    { regex: /lights?|turn on|turn off|dim/i, action: 'control_lights' },
    { regex: /music|spotify|play|pause/i, action: 'control_music' },
    { regex: /temperature|thermostat|ac|heat/i, action: 'control_climate' },

    // Research
    { regex: /search|look up|find|google/i, action: 'web_search' },
    { regex: /weather|forecast/i, action: 'check_weather' },

    // System
    { regex: /update|upgrade|sync|pull/i, action: 'sync_codebase' },
];

/**
 * Analyze recent messages to detect patterns
 */
export async function analyzeRecentMessages(hoursBack: number = 168): Promise<DetectedPattern[]> {
    if (!isDbConnected()) return [];

    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    const messages = await Message.getSince(since, 500);

    const patterns: DetectedPattern[] = [];

    // Group messages by day for temporal pattern detection
    const byDay = groupByDay(messages);

    // Detect temporal patterns
    for (const [day, dayMessages] of byDay.entries()) {
        const temporalPatterns = detectTemporalPatterns(dayMessages, day);
        patterns.push(...temporalPatterns);
    }

    // Detect sequential patterns (what follows what)
    const sequentialPatterns = detectSequentialPatterns(messages);
    patterns.push(...sequentialPatterns);

    // Detect conditional patterns (context-based)
    const conditionalPatterns = detectConditionalPatterns(messages);
    patterns.push(...conditionalPatterns);

    return mergeDuplicatePatterns(patterns);
}

function groupByDay(messages: Message[]): Map<string, Message[]> {
    const groups = new Map<string, Message[]>();

    for (const msg of messages) {
        const day = msg.created_at.toISOString().split('T')[0];
        if (!groups.has(day)) {
            groups.set(day, []);
        }
        groups.get(day)!.push(msg);
    }

    return groups;
}

function detectTemporalPatterns(messages: Message[], day: string): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    // Sort by time
    const sorted = [...messages].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());

    for (const msg of sorted) {
        if (msg.role !== 'user') continue;

        const content = msg.content.toLowerCase();
        const hour = msg.created_at.getHours();
        const dayOfWeek = msg.created_at.getDay();

        // Check for temporal keywords
        for (const keyword of TEMPORAL_KEYWORDS) {
            if (content.includes(keyword)) {
                const action = inferActionFromMessage(msg.content);
                if (action) {
                    patterns.push({
                        type: 'temporal',
                        trigger: `${hour}:00`,
                        action,
                        context: keyword,
                        confidence: 0.5,
                    });
                }
            }
        }

        // Detect routine-based patterns
        if (hour >= 8 && hour <= 10) {
            const action = inferActionFromMessage(msg.content);
            if (action && isMorningRoutineAction(action)) {
                patterns.push({
                    type: 'temporal',
                    trigger: 'morning',
                    action,
                    context: '8am-10am',
                    confidence: 0.4,
                });
            }
        }
    }

    return patterns;
}

function detectSequentialPatterns(messages: Message[]): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    // Look for pairs of messages where the same sequence repeats
    const sequences = new Map<string, number>();

    for (let i = 0; i < messages.length - 1; i++) {
        const msg1 = messages[i];
        const msg2 = messages[i + 1];

        if (msg1.role !== 'user' || msg2.role !== 'user') continue;

        const action1 = inferActionFromMessage(msg1.content);
        const action2 = inferActionFromMessage(msg2.content);

        if (action1 && action2 && action1 !== action2) {
            const key = `${action1} -> ${action2}`;
            sequences.set(key, (sequences.get(key) || 0) + 1);
        }
    }

    // Patterns that occur 3+ times are significant
    for (const [sequence, count] of sequences.entries()) {
        if (count >= 3) {
            const [trigger, action] = sequence.split(' -> ');
            patterns.push({
                type: 'sequential',
                trigger,
                action,
                confidence: Math.min(0.9, 0.5 + count * 0.1),
            });
        }
    }

    return patterns;
}

function detectConditionalPatterns(messages: Message[]): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    // Detect patterns based on context (medium, file changes, etc.)
    for (const msg of messages) {
        if (msg.role !== 'user') continue;

        const action = inferActionFromMessage(msg.content);
        if (!action) continue;

        // Voice mode patterns tend to be shorter
        if (msg.medium === 'voice' && msg.content.length < 50) {
            patterns.push({
                type: 'contextual',
                trigger: 'voice_mode',
                action,
                context: 'brief_commands',
                confidence: 0.4,
            });
        }

        // Check for file attachment context
        if (msg.attachments && msg.attachments.length > 0) {
            const ext = msg.attachments[0]?.originalName?.split('.').pop()?.toLowerCase();
            if (ext === 'ts' || ext === 'js' || ext === 'py') {
                patterns.push({
                    type: 'conditional',
                    trigger: 'code_file_attached',
                    action,
                    context: 'code_review',
                    confidence: 0.5,
                });
            }
        }
    }

    return patterns;
}

function inferActionFromMessage(content: string): string | null {
    for (const pattern of COMMAND_PATTERNS) {
        if (pattern.regex.test(content)) {
            return pattern.action;
        }
    }
    return null;
}

function isMorningRoutineAction(action: string): boolean {
    const morningActions = ['check_calendar', 'check_messages', 'check_email', 'check_weather'];
    return morningActions.includes(action);
}

function mergeDuplicatePatterns(patterns: DetectedPattern[]): DetectedPattern[] {
    const merged = new Map<string, DetectedPattern>();

    for (const pattern of patterns) {
        const key = `${pattern.type}:${pattern.trigger}:${pattern.action}:${pattern.context || ''}`;

        if (merged.has(key)) {
            const existing = merged.get(key)!;
            existing.confidence = Math.min(0.95, existing.confidence + 0.1);
        } else {
            merged.set(key, pattern);
        }
    }

    return Array.from(merged.values());
}

/**
 * Store detected patterns in the database
 */
export async function storePatterns(patterns: DetectedPattern[]): Promise<void> {
    if (!isDbConnected()) return;

    for (const pattern of patterns) {
        // Check if this pattern already exists
        const existing = await Pattern.findMatching(pattern.type, pattern.trigger, pattern.context);

        if (existing) {
            // Increment occurrence
            await Pattern.incrementOccurrence(existing.id);
        } else {
            // Create new pattern
            await Pattern.create({
                type: pattern.type,
                trigger: pattern.trigger,
                action: pattern.action,
                context: pattern.context,
                confidence: pattern.confidence,
                occurrences: 1,
                confirmations: 0,
                rejections: 0,
                last_occurred: new Date(),
                status: 'active',
            });
        }
    }
}
