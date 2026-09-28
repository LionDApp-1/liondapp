PRAGMA foreign_keys = ON;

CREATE TABLE users (
  skr_domain TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  bio TEXT,
  social_url TEXT,
  locale TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'deleted')),
  terms_version TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX users_wallet_active_idx ON users(wallet_address) WHERE status = 'active';

CREATE TABLE auth_challenges (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  nonce TEXT NOT NULL UNIQUE,
  message TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL UNIQUE REFERENCES auth_challenges(id),
  skr_domain TEXT NOT NULL REFERENCES users(skr_domain),
  wallet_address TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX sessions_identity_idx ON sessions(skr_domain, expires_at);

CREATE TABLE needs (
  id TEXT PRIMARY KEY,
  author_skr TEXT NOT NULL REFERENCES users(skr_domain),
  title TEXT NOT NULL,
  problem TEXT NOT NULL,
  solution_idea TEXT NOT NULL,
  audience TEXT NOT NULL,
  category TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  media_json TEXT NOT NULL DEFAULT '[]',
  need_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX needs_latest_idx ON needs(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX needs_popular_idx ON needs(need_count DESC, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE works (
  id TEXT PRIMARY KEY,
  author_skr TEXT NOT NULL REFERENCES users(skr_domain),
  name TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  store_url TEXT NOT NULL,
  category TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  icon_key TEXT NOT NULL,
  screenshots_json TEXT NOT NULL DEFAULT '[]',
  demo_url TEXT,
  moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'published', 'rejected', 'removed')),
  moderation_note TEXT,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  promoted_until TEXT,
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  deleted_at TEXT
);
CREATE INDEX works_latest_idx ON works(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX works_status_idx ON works(moderation_status, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  author_skr TEXT NOT NULL REFERENCES users(skr_domain),
  target_type TEXT NOT NULL CHECK (target_type IN ('need', 'work')),
  target_id TEXT NOT NULL,
  parent_id TEXT REFERENCES comments(id),
  body TEXT NOT NULL,
  like_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX comments_target_idx ON comments(target_type, target_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TRIGGER comments_need_target_insert BEFORE INSERT ON comments WHEN new.target_type = 'need' AND NOT EXISTS (SELECT 1 FROM needs WHERE id = new.target_id AND deleted_at IS NULL) BEGIN
  SELECT RAISE(ABORT, 'invalid_need_target');
END;
CREATE TRIGGER comments_work_target_insert BEFORE INSERT ON comments WHEN new.target_type = 'work' AND NOT EXISTS (SELECT 1 FROM works WHERE id = new.target_id AND deleted_at IS NULL AND moderation_status = 'published') BEGIN
  SELECT RAISE(ABORT, 'invalid_work_target');
END;
CREATE TRIGGER comments_parent_insert BEFORE INSERT ON comments WHEN new.parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM comments WHERE id = new.parent_id AND target_type = new.target_type AND target_id = new.target_id AND parent_id IS NULL AND deleted_at IS NULL) BEGIN
  SELECT RAISE(ABORT, 'invalid_comment_parent');
END;
CREATE TRIGGER comments_count_insert AFTER INSERT ON comments BEGIN
  UPDATE needs SET comment_count = comment_count + 1 WHERE new.target_type = 'need' AND id = new.target_id;
  UPDATE works SET comment_count = comment_count + 1 WHERE new.target_type = 'work' AND id = new.target_id;
END;
CREATE TRIGGER comments_count_delete AFTER UPDATE OF deleted_at ON comments WHEN old.deleted_at IS NULL AND new.deleted_at IS NOT NULL BEGIN
  UPDATE needs SET comment_count = MAX(0, comment_count - 1) WHERE new.target_type = 'need' AND id = new.target_id;
  UPDATE works SET comment_count = MAX(0, comment_count - 1) WHERE new.target_type = 'work' AND id = new.target_id;
END;

CREATE TABLE reactions (
  identity_skr TEXT NOT NULL REFERENCES users(skr_domain),
  target_type TEXT NOT NULL CHECK (target_type IN ('need', 'work', 'comment')),
  target_id TEXT NOT NULL,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('need', 'like')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (identity_skr, target_type, target_id)
);

CREATE TRIGGER reactions_need_target_insert BEFORE INSERT ON reactions WHEN new.target_type = 'need' AND NOT EXISTS (SELECT 1 FROM needs WHERE id = new.target_id AND deleted_at IS NULL) BEGIN
  SELECT RAISE(ABORT, 'invalid_need_target');
END;
CREATE TRIGGER reactions_work_target_insert BEFORE INSERT ON reactions WHEN new.target_type = 'work' AND NOT EXISTS (SELECT 1 FROM works WHERE id = new.target_id AND deleted_at IS NULL AND moderation_status = 'published') BEGIN
  SELECT RAISE(ABORT, 'invalid_work_target');
END;
CREATE TRIGGER reactions_comment_target_insert BEFORE INSERT ON reactions WHEN new.target_type = 'comment' AND NOT EXISTS (SELECT 1 FROM comments WHERE id = new.target_id AND deleted_at IS NULL) BEGIN
  SELECT RAISE(ABORT, 'invalid_comment_target');
END;
CREATE TRIGGER reactions_count_insert AFTER INSERT ON reactions BEGIN
  UPDATE needs SET need_count = need_count + 1 WHERE new.target_type = 'need' AND id = new.target_id;
  UPDATE works SET like_count = like_count + 1 WHERE new.target_type = 'work' AND id = new.target_id;
  UPDATE comments SET like_count = like_count + 1 WHERE new.target_type = 'comment' AND id = new.target_id;
END;
CREATE TRIGGER reactions_count_delete AFTER DELETE ON reactions BEGIN
  UPDATE needs SET need_count = MAX(0, need_count - 1) WHERE old.target_type = 'need' AND id = old.target_id;
  UPDATE works SET like_count = MAX(0, like_count - 1) WHERE old.target_type = 'work' AND id = old.target_id;
  UPDATE comments SET like_count = MAX(0, like_count - 1) WHERE old.target_type = 'comment' AND id = old.target_id;
END;

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  reporter_skr TEXT NOT NULL REFERENCES users(skr_domain),
  target_type TEXT NOT NULL CHECK (target_type IN ('need', 'work', 'comment', 'profile')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX reports_status_idx ON reports(status, created_at DESC);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  recipient_skr TEXT NOT NULL REFERENCES users(skr_domain),
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX notifications_recipient_idx ON notifications(recipient_skr, created_at DESC);

CREATE TABLE push_devices (
  token_hash TEXT PRIMARY KEY,
  recipient_skr TEXT NOT NULL REFERENCES users(skr_domain),
  fcm_token_encrypted TEXT NOT NULL,
  locale TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE promotion_orders (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES works(id),
  buyer_skr TEXT NOT NULL REFERENCES users(skr_domain),
  wallet_address TEXT NOT NULL,
  network TEXT NOT NULL CHECK (network IN ('devnet', 'mainnet-beta', 'simulation')),
  mint_address TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  token_amount INTEGER NOT NULL CHECK (token_amount > 0),
  base_units TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('quoted', 'submitted', 'confirmed', 'expired', 'failed')),
  signature TEXT UNIQUE,
  quoted_at TEXT NOT NULL,
  quote_expires_at TEXT NOT NULL,
  confirmed_at TEXT,
  promotion_starts_at TEXT,
  promotion_ends_at TEXT
);
CREATE INDEX promotion_orders_status_idx ON promotion_orders(status, quoted_at DESC);

CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO config(key, value, updated_at) VALUES ('recommendation_price_skr', '10', datetime('now'));
INSERT INTO config(key, value, updated_at) VALUES ('mainnet_payments_enabled', 'false', datetime('now'));
INSERT INTO config(key, value, updated_at) VALUES ('terms_version', '2026-09-06', datetime('now'));

CREATE TABLE announcements (
  id TEXT PRIMARY KEY,
  title_en TEXT NOT NULL,
  title_zh TEXT NOT NULL,
  body_en TEXT NOT NULL,
  body_zh TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  published_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX audit_log_created_idx ON audit_log(created_at DESC);

CREATE TABLE rate_limits (
  identity_skr TEXT NOT NULL,
  action TEXT NOT NULL,
  window_started_at INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (identity_skr, action)
);
