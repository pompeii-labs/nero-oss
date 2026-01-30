ALTER TABLE summaries ADD COLUMN IF NOT EXISTS session_start TIMESTAMP;
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS is_session_summary BOOLEAN DEFAULT FALSE;
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS message_count INTEGER;

ALTER TABLE memories ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_created_at_role ON messages(created_at DESC, role);
CREATE INDEX IF NOT EXISTS idx_summaries_is_session ON summaries(is_session_summary) WHERE is_session_summary = TRUE;
