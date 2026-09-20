-- Love Letter 3.4.4: Telegram OIDC + presence/statistics
CREATE TABLE IF NOT EXISTS telegram_oidc_sessions (
  state TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  return_to TEXT NOT NULL DEFAULT '/',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oidc_expires ON telegram_oidc_sessions(expires_at);
-- Existing telegram_users columns are added safely at runtime by ensureSchema
-- to support already-deployed D1 databases without duplicate-column failures.
