CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS graph_nodes (
    id SERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    label TEXT NOT NULL,
    body TEXT,
    embedding vector(1536),
    strength FLOAT DEFAULT 1.0,
    access_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP DEFAULT NOW(),
    category TEXT,
    metadata JSONB DEFAULT '{}',
    memory_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS graph_edges (
    id SERIAL PRIMARY KEY,
    source_id INTEGER NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    target_id INTEGER NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    relation TEXT NOT NULL,
    weight FLOAT DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(source_id, target_id, relation)
);

CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON graph_nodes(type);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_category ON graph_nodes(category);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_last_accessed ON graph_nodes(last_accessed DESC);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_strength ON graph_nodes(strength DESC);
CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_id);
