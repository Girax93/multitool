-- MultiTool sync — initial schema. Applied by `wrangler d1 migrations apply`
-- (CI) and by worker/src/node-server.ts (local / tests).

CREATE TABLE accounts (
  id          TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  seq         INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

-- One row per synced key. `blob` is ciphertext (base64); the server never
-- learns keys or values. `seq` is per account, assigned on every applied write.
CREATE TABLE records (
  account_id TEXT NOT NULL,
  rid        TEXT NOT NULL,
  blob       TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  seq        INTEGER NOT NULL,
  PRIMARY KEY (account_id, rid)
);
CREATE INDEX records_seq ON records (account_id, seq);

-- Device-linking codes: the account key wrapped with a key derived from the
-- short code. Single use, 10 minutes.
CREATE TABLE pairings (
  lookup_id  TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  salt       TEXT NOT NULL,
  wrapped    TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Claim attempts per IP, for rate limiting.
CREATE TABLE claims (
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX claims_ip ON claims (ip, at);
