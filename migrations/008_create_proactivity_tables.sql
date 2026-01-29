CREATE TABLE IF NOT EXISTS thinking_runs (
    id SERIAL PRIMARY KEY,
    thought TEXT NOT NULL,
    surfaced BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_thinking_runs_created_at ON thinking_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_thinking_runs_surfaced ON thinking_runs(surfaced);

CREATE TABLE IF NOT EXISTS proactivity_state (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);
