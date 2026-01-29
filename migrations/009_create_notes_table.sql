CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    category VARCHAR(50),
    surfaced BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_surfaced ON notes(surfaced);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at);
