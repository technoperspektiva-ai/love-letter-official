PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS telegram_users (
  telegram_id TEXT PRIMARY KEY,
  username TEXT,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  photo_url TEXT,
  language_code TEXT,
  ref_code TEXT NOT NULL UNIQUE,
  referred_by TEXT,
  bonus_credits INTEGER NOT NULL DEFAULT 0 CHECK (bonus_credits >= 0),
  paid_credits INTEGER NOT NULL DEFAULT 0 CHECK (paid_credits >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (referred_by) REFERENCES telegram_users(telegram_id)
);

CREATE INDEX IF NOT EXISTS idx_users_ref_code ON telegram_users(ref_code);

CREATE TABLE IF NOT EXISTS monthly_usage (
  telegram_id TEXT NOT NULL,
  month_key TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  free_limit INTEGER NOT NULL DEFAULT 3 CHECK (free_limit >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (telegram_id, month_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  inviter_id TEXT NOT NULL,
  invited_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','qualified','rejected')),
  created_at INTEGER NOT NULL,
  qualified_at INTEGER,
  UNIQUE (inviter_id, invited_id),
  FOREIGN KEY (inviter_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (invited_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_referrals_inviter ON referrals(inviter_id, status);

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  public_token TEXT NOT NULL UNIQUE,
  owner_telegram_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  title TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  credit_source TEXT NOT NULL CHECK (credit_source IN ('monthly','bonus','paid')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (owner_telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stories_owner ON stories(owner_telegram_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_public ON stories(public_token);

CREATE TABLE IF NOT EXISTS story_choices (
  story_id TEXT PRIMARY KEY,
  choice_index INTEGER NOT NULL,
  chosen_at INTEGER NOT NULL,
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  invoice_payload TEXT NOT NULL UNIQUE,
  stars INTEGER NOT NULL CHECK (stars > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','canceled','refunded','failed')),
  telegram_payment_charge_id TEXT UNIQUE,
  provider_payment_charge_id TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  refunded_at INTEGER,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(telegram_id, created_at DESC);
