ALTER TABLE stories ADD COLUMN client_request_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_stories_owner_request
ON stories(owner_telegram_id, client_request_id);
