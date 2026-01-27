ALTER TABLE messages ADD COLUMN IF NOT EXISTS medium VARCHAR(16) DEFAULT 'cli';

CREATE INDEX IF NOT EXISTS idx_messages_medium ON messages(medium);

COMMENT ON COLUMN messages.medium IS 'Source medium: cli, voice, sms, api';
