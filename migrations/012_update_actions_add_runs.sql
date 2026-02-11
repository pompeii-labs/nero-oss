ALTER TABLE actions ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE actions ADD COLUMN IF NOT EXISTS last_run TIMESTAMP;

CREATE TABLE IF NOT EXISTS action_runs (
    id SERIAL PRIMARY KEY,
    action_id INTEGER NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'running',
    result TEXT,
    error TEXT,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    duration_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_action_runs_action_id ON action_runs(action_id);
