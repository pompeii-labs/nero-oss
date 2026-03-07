-- Tool Output Learning System
-- Stores tool executions and their outputs for semantic search and pattern learning

-- Table for storing tool outputs with embeddings
CREATE TABLE IF NOT EXISTS tool_outputs (
    id SERIAL PRIMARY KEY,
    tool_name TEXT NOT NULL,
    args_hash TEXT NOT NULL,
    args_preview TEXT NOT NULL,
    output_preview TEXT NOT NULL,
    output_embedding vector(1536),
    output_full TEXT,
    cwd TEXT,
    exit_code INTEGER,
    execution_time_ms INTEGER,
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint to avoid duplicates for identical args
    UNIQUE(tool_name, args_hash)
);

-- Table for learned behavior patterns
CREATE TABLE IF NOT EXISTS tool_behavior_patterns (
    id SERIAL PRIMARY KEY,
    tool_name TEXT NOT NULL,
    pattern_type TEXT NOT NULL CHECK (pattern_type IN ('common_args', 'common_output', 'error_pattern', 'success_pattern')),
    pattern_value TEXT NOT NULL,
    frequency INTEGER NOT NULL DEFAULT 1,
    context_cwd TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_tool_outputs_tool_name ON tool_outputs(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_outputs_success ON tool_outputs(success);
CREATE INDEX IF NOT EXISTS idx_tool_outputs_created_at ON tool_outputs(created_at);
CREATE INDEX IF NOT EXISTS idx_tool_outputs_embedding ON tool_outputs USING ivfflat (output_embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_tool_behavior_tool_name ON tool_behavior_patterns(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_behavior_type ON tool_behavior_patterns(pattern_type);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_tool_outputs_updated_at ON tool_outputs;
CREATE TRIGGER update_tool_outputs_updated_at
    BEFORE UPDATE ON tool_outputs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tool_behavior_updated_at ON tool_behavior_patterns;
CREATE TRIGGER update_tool_behavior_updated_at
    BEFORE UPDATE ON tool_behavior_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
