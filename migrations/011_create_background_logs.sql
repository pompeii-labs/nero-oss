CREATE TABLE IF NOT EXISTS background_logs (
    id SERIAL PRIMARY KEY,
    tool TEXT NOT NULL,
    args_summary TEXT NOT NULL,
    result_summary TEXT NOT NULL,
    thinking_run_id INTEGER REFERENCES thinking_runs(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_background_logs_created_at ON background_logs(created_at);
