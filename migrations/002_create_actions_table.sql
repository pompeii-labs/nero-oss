CREATE TABLE IF NOT EXISTS actions (
    id SERIAL PRIMARY KEY,
    request TEXT NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    recurrence TEXT,
    steps TEXT[] DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_actions_timestamp ON actions(timestamp);
