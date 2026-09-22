-- Linked devices. Every device authenticates with its own token, so one can
-- be removed from the account without touching the others.
CREATE TABLE devices (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL,
  name         TEXT NOT NULL,
  token_hash   TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX devices_account ON devices (account_id, created_at);
CREATE INDEX devices_token ON devices (account_id, token_hash);
