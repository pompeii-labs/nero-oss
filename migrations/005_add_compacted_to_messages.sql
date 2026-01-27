ALTER TABLE messages ADD COLUMN IF NOT EXISTS compacted BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_messages_compacted ON messages(compacted) WHERE compacted = FALSE;
