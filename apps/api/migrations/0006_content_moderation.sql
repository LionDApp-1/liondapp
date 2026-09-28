CREATE TABLE moderation_events (
  id TEXT PRIMARY KEY,
  identity_skr TEXT NOT NULL REFERENCES users(skr_domain),
  surface TEXT NOT NULL CHECK (surface IN ('need', 'work', 'comment', 'profile')),
  category TEXT NOT NULL CHECK (category IN ('sexual', 'crime', 'violence', 'politics', 'hate', 'wallet_abuse')),
  created_at TEXT NOT NULL
);

CREATE INDEX moderation_events_identity_idx ON moderation_events(identity_skr, created_at DESC);
CREATE INDEX moderation_events_created_idx ON moderation_events(created_at DESC);

UPDATE config SET value = '2026-09-08.1', updated_at = datetime('now') WHERE key = 'terms_version';
