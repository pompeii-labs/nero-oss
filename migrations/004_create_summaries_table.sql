CREATE TABLE IF NOT EXISTS summaries (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    covers_until TIMESTAMP NOT NULL,
    token_estimate INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_summaries_created_at ON summaries(created_at DESC);
