import chalk from 'chalk';
import type { NeroConfig } from '../config.js';
import { Pattern, Prediction } from './models.js';
import { analyzeRecentMessages, storePatterns } from './learner.js';
import { generateSuggestions, recordPrediction, formatSuggestions } from './predictor.js';

/**
 * PatternEngine runs periodically to:
 * 1. Analyze message history for new patterns
 * 2. Generate suggestions based on detected patterns
 * 3. Track prediction outcomes to improve confidence
 */
export class PatternEngine {
    private config: NeroConfig;
    private isRunning: boolean = false;

    constructor(config: NeroConfig) {
        this.config = config;
    }

    /**
     * Run a full pattern learning cycle
     * Called during background thinking sessions
     */
    async run(): Promise<string | null> {
        if (this.isRunning) return null;
        this.isRunning = true;

        try {
            console.log(chalk.dim('[patterns] Running pattern analysis...'));

            // Step 1: Learn new patterns from recent messages
            const detectedPatterns = await analyzeRecentMessages(168); // Last week
            if (detectedPatterns.length > 0) {
                await storePatterns(detectedPatterns);
                console.log(
                    chalk.dim(`[patterns] Learned ${detectedPatterns.length} new patterns`),
                );
            }

            // Step 2: Generate suggestions based on current context
            const suggestions = await generateSuggestions(this.config);

            if (suggestions.length > 0) {
                // Store predictions for outcome tracking
                for (const suggestion of suggestions) {
                    await recordPrediction(
                        suggestion.id,
                        suggestion.action,
                        suggestion.context,
                        suggestion.confidence,
                    );
                }

                // Return formatted suggestions for the user
                const formatted = formatSuggestions(suggestions);
                return `[PATTERNS] ${formatted}`;
            }

            return null;
        } catch (error) {
            console.error(chalk.dim(`[patterns] Error: ${(error as Error).message}`));
            return null;
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Get pending suggestions that haven't been presented yet
     */
    async getPendingSuggestions(): Promise<
        Array<{
            id: number;
            action: string;
            context?: string;
            confidence: number;
        }>
    > {
        const predictions = await Prediction.getPending();
        const suggestions = [];

        for (const pred of predictions) {
            const pattern = await Pattern.getById(pred.pattern_id);
            if (pattern && pattern.status === 'active') {
                suggestions.push({
                    id: pred.id,
                    action: pred.predicted_action,
                    context: pred.context,
                    confidence: pred.confidence,
                });
            }
        }

        return suggestions;
    }

    /**
     * Mark a suggestion as presented to the user
     */
    async markPresented(predictionId: number): Promise<void> {
        await Prediction.markPresented(predictionId);
    }

    /**
     * Record user response to a suggestion
     * @param predictionId The prediction ID
     * @param accepted Whether the user accepted the suggestion
     */
    async recordOutcome(predictionId: number, accepted: boolean): Promise<void> {
        await Prediction.recordOutcome(predictionId, accepted);
        console.log(
            chalk.dim(
                `[patterns] Recorded ${accepted ? 'acceptance' : 'rejection'} for prediction ${predictionId}`,
            ),
        );
    }

    /**
     * Get statistics about the pattern engine
     */
    async getStats(): Promise<{
        totalPatterns: number;
        activePatterns: number;
        confirmedPatterns: number;
        totalPredictions: number;
        successRate: number;
    }> {
        const allPatterns = await Pattern.list({});
        const activePatterns = allPatterns.filter((p) => p.status === 'active');
        const confirmedPatterns = allPatterns.filter((p) => p.status === 'confirmed');

        // Calculate success rate from predictions
        const { rows } = await db.query(
            `SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN accepted = TRUE THEN 1 END) as accepted,
                COUNT(CASE WHEN accepted = FALSE THEN 1 END) as rejected
            FROM predictions WHERE accepted IS NOT NULL`,
        );

        const totalPredictions = parseInt(rows[0]?.total || '0');
        const acceptedCount = parseInt(rows[0]?.accepted || '0');
        const rejectedCount = parseInt(rows[0]?.rejected || '0');

        const successRate =
            acceptedCount + rejectedCount > 0 ? acceptedCount / (acceptedCount + rejectedCount) : 0;

        return {
            totalPatterns: allPatterns.length,
            activePatterns: activePatterns.length,
            confirmedPatterns: confirmedPatterns.length,
            totalPredictions,
            successRate,
        };
    }
}

import { db } from '../db/index.js';
export { Pattern, Prediction } from '../models/pattern.js';
export { analyzeRecentMessages, storePatterns } from './learner.js';
export { generateSuggestions, recordPrediction, formatSuggestions } from './predictor.js';
