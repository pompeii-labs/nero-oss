import { db, isDbConnected } from '../db/index.js';
import { Model } from './base.js';

export type PatternType = 'temporal' | 'sequential' | 'conditional' | 'contextual';
export type PatternStatus = 'active' | 'inactive' | 'confirmed' | 'rejected';

export interface PatternData {
    id: number;
    type: PatternType;
    trigger: string; // What causes this pattern (e.g., "morning", "after:git_commit")
    action: string; // What the user typically does (e.g., "check_calendar", "run_tests")
    context?: string; // Additional context (e.g., "monday", "voice_mode")
    confidence: number; // 0-1, increases with confirmations
    occurrences: number; // How many times we've seen this
    confirmations: number; // How many times user accepted our suggestion
    rejections: number; // How many times user rejected
    last_occurred: Date;
    status: PatternStatus;
    created_at: Date;
}

export class Pattern extends Model<PatternData> implements PatternData {
    declare type: PatternType;
    declare trigger: string;
    declare action: string;
    declare context?: string;
    declare confidence: number;
    declare occurrences: number;
    declare confirmations: number;
    declare rejections: number;
    declare last_occurred: Date;
    declare status: PatternStatus;
    declare created_at: Date;

    static override tableName = 'patterns';

    static async getById(id: number): Promise<Pattern | null> {
        return Pattern.get(id);
    }

    static async findMatching(
        type: PatternType,
        trigger: string,
        context?: string,
    ): Promise<Pattern | null> {
        if (!isDbConnected()) return null;

        const { rows } = await db.query(
            `SELECT * FROM patterns 
             WHERE type = $1 AND trigger = $2 AND status = 'active'
             ${context ? 'AND (context = $3 OR context IS NULL)' : ''}
             ORDER BY confidence DESC LIMIT 1`,
            context ? [type, trigger, context] : [type, trigger],
        );

        return rows[0] ? new Pattern(rows[0]) : null;
    }

    static async findActive(limit: number = 20): Promise<Pattern[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM patterns 
             WHERE status = 'active' 
             ORDER BY confidence DESC, occurrences DESC 
             LIMIT $1`,
            [limit],
        );

        return rows.map((row) => new Pattern(row));
    }

    static async incrementOccurrence(id: number): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(
            `UPDATE patterns 
             SET occurrences = occurrences + 1, last_occurred = NOW() 
             WHERE id = $1`,
            [id],
        );
    }

    static async recordConfirmation(id: number): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(
            `UPDATE patterns 
             SET confirmations = confirmations + 1,
                 confidence = LEAST(1.0, confidence + 0.05),
                 status = CASE WHEN confidence > 0.7 THEN 'confirmed' ELSE status END
             WHERE id = $1`,
            [id],
        );
    }

    static async recordRejection(id: number): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(
            `UPDATE patterns 
             SET rejections = rejections + 1,
                 confidence = GREATEST(0.1, confidence - 0.1),
                 status = CASE WHEN confidence < 0.3 THEN 'inactive' ELSE status END
             WHERE id = $1`,
            [id],
        );
    }

    get successRate(): number {
        const total = this.confirmations + this.rejections;
        if (total === 0) return this.confidence;
        return this.confirmations / total;
    }
}

export interface PredictionData {
    id: number;
    pattern_id: number;
    predicted_action: string;
    context?: string;
    confidence: number;
    triggered_at: Date;
    presented: boolean;
    accepted?: boolean;
    created_at: Date;
}

export class Prediction extends Model<PredictionData> implements PredictionData {
    declare pattern_id: number;
    declare predicted_action: string;
    declare context?: string;
    declare confidence: number;
    declare triggered_at: Date;
    declare presented: boolean;
    declare accepted?: boolean;
    declare created_at: Date;

    static override tableName = 'predictions';

    static async getById(id: number): Promise<Prediction | null> {
        return Prediction.get(id);
    }

    static async getPending(): Promise<Prediction[]> {
        if (!isDbConnected()) return [];

        const { rows } = await db.query(
            `SELECT * FROM predictions WHERE presented = FALSE ORDER BY created_at ASC`,
        );

        return rows.map((row) => new Prediction(row));
    }

    static async markPresented(id: number): Promise<void> {
        if (!isDbConnected()) return;
        await db.query(`UPDATE predictions SET presented = TRUE WHERE id = $1`, [id]);
    }

    static async recordOutcome(id: number, accepted: boolean): Promise<void> {
        if (!isDbConnected()) return;

        await db.query(`UPDATE predictions SET accepted = $1 WHERE id = $2`, [accepted, id]);

        // Update the pattern's confidence
        const pred = await Prediction.getById(id);
        if (pred) {
            if (accepted) {
                await Pattern.recordConfirmation(pred.pattern_id);
            } else {
                await Pattern.recordRejection(pred.pattern_id);
            }
        }
    }
}
