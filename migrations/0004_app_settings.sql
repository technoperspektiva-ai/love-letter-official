CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO app_settings (key, value, updated_at)
VALUES ('browser_access_enabled', '0', CAST(strftime('%s','now') AS INTEGER) * 1000);
