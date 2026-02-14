CREATE TABLE IF NOT EXISTS autonomy_projects (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    priority INTEGER NOT NULL DEFAULT 3,
    progress_notes TEXT[] DEFAULT '{}',
    next_step TEXT,
    total_sessions INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_autonomy_projects_status ON autonomy_projects(status);

CREATE TABLE IF NOT EXISTS autonomy_journal (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    project_id INTEGER REFERENCES autonomy_projects(id) ON DELETE SET NULL,
    entry TEXT NOT NULL,
    tokens_used INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_autonomy_journal_session_id ON autonomy_journal(session_id);
CREATE INDEX IF NOT EXISTS idx_autonomy_journal_created_at ON autonomy_journal(created_at);
