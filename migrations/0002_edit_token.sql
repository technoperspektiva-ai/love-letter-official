ALTER TABLE stories ADD COLUMN edit_token TEXT;
CREATE INDEX IF NOT EXISTS idx_stories_edit_token ON stories(edit_token);
