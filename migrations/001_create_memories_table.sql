CREATE TABLE IF NOT EXISTS memories (
    id SERIAL PRIMARY KEY,
    body TEXT NOT NULL,
    related_to INTEGER[] DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);
