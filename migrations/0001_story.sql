CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stories_created_at ON stories(created_at);
