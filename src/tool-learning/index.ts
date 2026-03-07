import { db, isDbConnected } from '../db/index.js';
import { embed, embedBatch } from '../graph/embedding.js';

export interface ToolOutputEntry {
    id: number;
    tool_name: string;
    args_hash: string;
    args_preview: string;
    output_preview: string;
    output_embedding: number[];
    output_full?: string;
    cwd: string;
    exit_code?: number;
    execution_time_ms?: number;
    created_at: Date;
    success: boolean;
    error_message?: string;
}

export interface ToolBehaviorPattern {
    id: number;
    tool_name: string;
    pattern_type: 'common_args' | 'common_output' | 'error_pattern' | 'success_pattern';
    pattern_value: string;
    frequency: number;
    context_cwd?: string;
    created_at: Date;
}

const MAX_OUTPUT_LENGTH = 10000;
const EMBEDDABLE_OUTPUT_LENGTH = 8000;

/**
 * Store a tool execution with its output for learning
 */
export async function storeToolOutput(
    toolName: string,
    args: Record<string, any>,
    output: string,
    options: {
        cwd?: string;
        exitCode?: number;
        executionTimeMs?: number;
        errorMessage?: string;
    } = {},
): Promise<void> {
    if (!isDbConnected()) return;

    const argsHash = hashArgs(args);
    const argsPreview = JSON.stringify(args).slice(0, 500);
    const outputPreview = output.slice(0, 1000);
    const success = options.exitCode === 0 || options.exitCode === undefined;

    // Only embed if output is meaningful (not too short, not error noise)
    let embedding: number[] | null = null;
    if (output.length > 50 && output.length < EMBEDDABLE_OUTPUT_LENGTH && success) {
        try {
            embedding = await embed(truncateForEmbedding(output));
        } catch {
            // Continue without embedding if it fails
        }
    }

    try {
        await db.query(
            `INSERT INTO tool_outputs 
             (tool_name, args_hash, args_preview, output_preview, output_embedding, 
              output_full, cwd, exit_code, execution_time_ms, success, error_message)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (tool_name, args_hash) 
             DO UPDATE SET 
                output_preview = EXCLUDED.output_preview,
                output_embedding = EXCLUDED.output_embedding,
                output_full = EXCLUDED.output_full,
                exit_code = EXCLUDED.exit_code,
                execution_time_ms = EXCLUDED.execution_time_ms,
                success = EXCLUDED.success,
                error_message = EXCLUDED.error_message,
                created_at = NOW()`,
            [
                toolName,
                argsHash,
                argsPreview,
                outputPreview,
                embedding ? JSON.stringify(embedding) : null,
                output.length > MAX_OUTPUT_LENGTH ? output.slice(0, MAX_OUTPUT_LENGTH) : output,
                options.cwd || process.cwd(),
                options.exitCode,
                options.executionTimeMs,
                success,
                options.errorMessage,
            ],
        );
    } catch (error) {
        console.error('[tool-learning] Failed to store output:', error);
    }
}

/**
 * Find similar past tool outputs using semantic search
 */
export async function findSimilarOutputs(
    query: string,
    toolName?: string,
    limit: number = 5,
): Promise<
    Array<{
        tool_name: string;
        args_preview: string;
        output_preview: string;
        similarity: number;
        created_at: Date;
    }>
> {
    if (!isDbConnected()) return [];

    try {
        const queryEmbedding = await embed(query);

        const sql = toolName
            ? `SELECT tool_name, args_preview, output_preview, created_at,
                      1 - (output_embedding <=> $1::vector) as similarity
               FROM tool_outputs 
               WHERE tool_name = $2 AND output_embedding IS NOT NULL
               ORDER BY output_embedding <=> $1::vector
               LIMIT $3`
            : `SELECT tool_name, args_preview, output_preview, created_at,
                      1 - (output_embedding <=> $1::vector) as similarity
               FROM tool_outputs 
               WHERE output_embedding IS NOT NULL
               ORDER BY output_embedding <=> $1::vector
               LIMIT $2`;

        const params = toolName
            ? [JSON.stringify(queryEmbedding), toolName, limit]
            : [JSON.stringify(queryEmbedding), limit];

        const { rows } = await db.query(sql, params);

        return rows.map((row: any) => ({
            tool_name: row.tool_name,
            args_preview: row.args_preview,
            output_preview: row.output_preview,
            similarity: parseFloat(row.similarity),
            created_at: new Date(row.created_at),
        }));
    } catch (error) {
        console.error('[tool-learning] Search failed:', error);
        return [];
    }
}

/**
 * Get the most common successful patterns for a tool
 */
export async function getToolPatterns(
    toolName: string,
    minFrequency: number = 2,
): Promise<ToolBehaviorPattern[]> {
    if (!isDbConnected()) return [];

    try {
        // Find common argument patterns
        const { rows: argRows } = await db.query(
            `SELECT args_preview, COUNT(*) as freq
             FROM tool_outputs
             WHERE tool_name = $1 AND success = true
             GROUP BY args_preview
             HAVING COUNT(*) >= $2
             ORDER BY freq DESC
             LIMIT 10`,
            [toolName, minFrequency],
        );

        const patterns: ToolBehaviorPattern[] = [];

        for (const row of argRows) {
            patterns.push({
                id: 0, // Virtual ID
                tool_name: toolName,
                pattern_type: 'common_args',
                pattern_value: row.args_preview,
                frequency: parseInt(row.freq),
                created_at: new Date(),
            });
        }

        return patterns;
    } catch (error) {
        console.error('[tool-learning] Pattern analysis failed:', error);
        return [];
    }
}

/**
 * Learn from tool outputs to suggest better future usage
 */
export async function learnToolBehaviors(): Promise<void> {
    if (!isDbConnected()) return;

    try {
        // Find tools that frequently fail with certain args
        const { rows: errorPatterns } = await db.query(
            `SELECT tool_name, args_preview, COUNT(*) as error_count
             FROM tool_outputs
             WHERE success = false AND created_at > NOW() - INTERVAL '7 days'
             GROUP BY tool_name, args_preview
             HAVING COUNT(*) >= 2
             ORDER BY error_count DESC`,
        );

        for (const row of errorPatterns) {
            // Check if this pattern is already recorded
            const { rows: existing } = await db.query(
                `SELECT id FROM tool_behavior_patterns
                 WHERE tool_name = $1 AND pattern_type = 'error_pattern' 
                 AND pattern_value = $2`,
                [row.tool_name, row.args_preview],
            );

            if (existing.length === 0) {
                await db.query(
                    `INSERT INTO tool_behavior_patterns 
                     (tool_name, pattern_type, pattern_value, frequency, context_cwd)
                     VALUES ($1, 'error_pattern', $2, $3, NULL)`,
                    [row.tool_name, row.args_preview, parseInt(row.error_count)],
                );
            } else {
                await db.query(
                    `UPDATE tool_behavior_patterns 
                     SET frequency = $1, updated_at = NOW()
                     WHERE id = $2`,
                    [parseInt(row.error_count), existing[0].id],
                );
            }
        }

        console.log(`[tool-learning] Learned ${errorPatterns.length} error patterns`);
    } catch (error) {
        console.error('[tool-learning] Behavior learning failed:', error);
    }
}

/**
 * Get suggestions for a tool based on past usage
 */
export async function getToolSuggestions(
    toolName: string,
    currentArgs?: Record<string, any>,
): Promise<
    Array<{
        type: 'common_args' | 'similar_success' | 'avoid_pattern';
        suggestion: string;
        confidence: number;
        context?: string;
    }>
> {
    if (!isDbConnected()) return [];

    const suggestions: Array<{
        type: 'common_args' | 'similar_success' | 'avoid_pattern';
        suggestion: string;
        confidence: number;
        context?: string;
    }> = [];

    try {
        // Get common successful args
        const { rows: commonArgs } = await db.query(
            `SELECT args_preview, COUNT(*) as freq,
                    AVG(CASE WHEN success THEN 1 ELSE 0 END) as success_rate
             FROM tool_outputs
             WHERE tool_name = $1
             GROUP BY args_preview
             HAVING COUNT(*) >= 2
             ORDER BY freq DESC, success_rate DESC
             LIMIT 3`,
            [toolName],
        );

        for (const row of commonArgs) {
            const successRate = parseFloat(row.success_rate);
            if (successRate > 0.7) {
                suggestions.push({
                    type: 'common_args',
                    suggestion: row.args_preview,
                    confidence: Math.min(0.95, parseInt(row.freq) * 0.1 + successRate * 0.3),
                    context: `Used ${row.freq} times with ${Math.round(successRate * 100)}% success`,
                });
            }
        }

        // Get error patterns to avoid
        const { rows: errorPatterns } = await db.query(
            `SELECT pattern_value, frequency
             FROM tool_behavior_patterns
             WHERE tool_name = $1 AND pattern_type = 'error_pattern'
             ORDER BY frequency DESC
             LIMIT 3`,
            [toolName],
        );

        for (const row of errorPatterns) {
            suggestions.push({
                type: 'avoid_pattern',
                suggestion: row.pattern_value,
                confidence: Math.min(0.9, parseInt(row.frequency) * 0.15),
                context: `Failed ${row.frequency} times recently`,
            });
        }

        return suggestions;
    } catch (error) {
        console.error('[tool-learning] Suggestion failed:', error);
        return [];
    }
}

/**
 * Search past tool outputs with natural language
 */
export async function semanticToolSearch(
    query: string,
    options: {
        toolName?: string;
        successOnly?: boolean;
        since?: Date;
        limit?: number;
    } = {},
): Promise<
    Array<{
        tool_name: string;
        args: string;
        output: string;
        when: string;
        relevance: number;
    }>
> {
    if (!isDbConnected()) return [];

    const { toolName, successOnly = true, since, limit = 5 } = options;

    try {
        const queryEmbedding = await embed(query);

        let sql = `SELECT tool_name, args_preview, output_preview, created_at,
                          1 - (output_embedding <=> $1::vector) as similarity
                   FROM tool_outputs 
                   WHERE output_embedding IS NOT NULL`;
        const params: any[] = [JSON.stringify(queryEmbedding)];
        let paramIdx = 2;

        if (toolName) {
            sql += ` AND tool_name = $${paramIdx++}`;
            params.push(toolName);
        }

        if (successOnly) {
            sql += ` AND success = true`;
        }

        if (since) {
            sql += ` AND created_at > $${paramIdx++}`;
            params.push(since);
        }

        sql += ` ORDER BY output_embedding <=> $1::vector LIMIT $${paramIdx}`;
        params.push(limit);

        const { rows } = await db.query(sql, params);

        return rows.map((row: any) => ({
            tool_name: row.tool_name,
            args: row.args_preview,
            output: row.output_preview,
            when: formatTimeAgo(new Date(row.created_at)),
            relevance: Math.round(parseFloat(row.similarity) * 100),
        }));
    } catch (error) {
        console.error('[tool-learning] Semantic search failed:', error);
        return [];
    }
}

function hashArgs(args: Record<string, any>): string {
    const str = JSON.stringify(args, Object.keys(args).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
    }
    return hash.toString(36);
}

function truncateForEmbedding(text: string): string {
    // Truncate intelligently - keep beginning and end, drop middle
    if (text.length <= EMBEDDABLE_OUTPUT_LENGTH) return text;

    const half = Math.floor(EMBEDDABLE_OUTPUT_LENGTH / 2);
    return text.slice(0, half) + '\n...[truncated]...\n' + text.slice(-half);
}

function formatTimeAgo(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
}

export async function cleanupOldOutputs(daysToKeep: number = 30): Promise<void> {
    if (!isDbConnected()) return;

    try {
        const { rowCount } = await db.query(
            `DELETE FROM tool_outputs WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'`,
        );
        console.log(`[tool-learning] Cleaned up ${rowCount} old tool outputs`);
    } catch (error) {
        console.error('[tool-learning] Cleanup failed:', error);
    }
}
