-- Create patterns table for the Predictive Action Engine
CREATE TABLE IF NOT EXISTS patterns (
    id SERIAL PRIMARY KEY,
    type VARCHAR(20) NOT NULL CHECK (type IN ('temporal', 'sequential', 'conditional', 'contextual')),
    trigger TEXT NOT NULL,
    action TEXT NOT NULL,
    context TEXT,
    confidence DECIMAL(3,2) DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
    occurrences INTEGER DEFAULT 1,
    confirmations INTEGER DEFAULT 0,
    rejections INTEGER DEFAULT 0,
    last_occurred TIMESTAMP DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'confirmed', 'rejected')),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast pattern lookups
CREATE INDEX idx_patterns_type_trigger ON patterns(type, trigger);
CREATE INDEX idx_patterns_status_confidence ON patterns(status, confidence DESC);

-- Create predictions table
CREATE TABLE IF NOT EXISTS predictions (
    id SERIAL PRIMARY KEY,
    pattern_id INTEGER NOT NULL REFERENCES patterns(id) ON DELETE CASCADE,
    predicted_action TEXT NOT NULL,
    context TEXT,
    confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    triggered_at TIMESTAMP DEFAULT NOW(),
    presented BOOLEAN DEFAULT FALSE,
    accepted BOOLEAN,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for pending predictions
CREATE INDEX idx_predictions_presented ON predictions(presented) WHERE presented = FALSE;
CREATE INDEX idx_predictions_created ON predictions(created_at);
