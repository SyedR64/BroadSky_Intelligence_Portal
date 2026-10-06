-- D1 schema for the Broad Sky assistant backend (database: bsp_assistant).
-- Idempotent: safe to apply on every deploy.

CREATE TABLE IF NOT EXISTS threads (
  id            TEXT PRIMARY KEY,               -- client-generated, unguessable (UUID)
  persona       TEXT NOT NULL DEFAULT 'portal',
  title         TEXT NOT NULL DEFAULT '',
  messages_json TEXT NOT NULL DEFAULT '[]',     -- JSON array of {role, content, id?, ts?}
  created_at    TEXT NOT NULL,                  -- ISO-8601 UTC
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_threads_updated ON threads(updated_at);
CREATE INDEX IF NOT EXISTS idx_threads_persona ON threads(persona);

CREATE TABLE IF NOT EXISTS feedback (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id      TEXT,
  message_id     TEXT,
  rating         INTEGER NOT NULL,              -- -1 (down) / 1 (up), or 1..5
  question       TEXT NOT NULL DEFAULT '',
  answer_excerpt TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_thread ON feedback(thread_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);

CREATE TABLE IF NOT EXISTS usage_daily (
  day        TEXT PRIMARY KEY,                  -- YYYY-MM-DD (UTC)
  requests   INTEGER NOT NULL DEFAULT 0,        -- /chat requests admitted or attempted that day
  tokens_in  INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0
);
