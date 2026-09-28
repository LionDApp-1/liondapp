PRAGMA foreign_keys = ON;

CREATE TABLE user_blocks (
  blocker_skr TEXT NOT NULL REFERENCES users(skr_domain),
  blocked_skr TEXT NOT NULL REFERENCES users(skr_domain),
  created_at TEXT NOT NULL,
  PRIMARY KEY (blocker_skr, blocked_skr),
  CHECK (blocker_skr <> blocked_skr)
);

CREATE INDEX user_blocks_blocked_idx ON user_blocks(blocked_skr, blocker_skr);

UPDATE config SET value = '2026-09-06.2', updated_at = datetime('now') WHERE key = 'terms_version';
