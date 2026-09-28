CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  need_id TEXT NOT NULL REFERENCES needs(id),
  owner_skr TEXT NOT NULL REFERENCES users(skr_domain),
  developer_skr TEXT NOT NULL REFERENCES users(skr_domain),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(owner_skr != developer_skr),
  UNIQUE(need_id, developer_skr)
);
CREATE INDEX conversations_owner_idx ON conversations(owner_skr, updated_at DESC);
CREATE INDEX conversations_developer_idx ON conversations(developer_skr, updated_at DESC);
CREATE TABLE messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  sender_skr TEXT NOT NULL REFERENCES users(skr_domain),
  client_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(sender_skr, client_id)
);
CREATE INDEX messages_conversation_idx ON messages(conversation_id, seq DESC);
CREATE TABLE conversation_reads (
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  reader_skr TEXT NOT NULL REFERENCES users(skr_domain),
  last_seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(conversation_id, reader_skr)
);
CREATE TABLE message_reports (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id),
  reporter_skr TEXT NOT NULL REFERENCES users(skr_domain),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','removed','dismissed')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  UNIQUE(message_id, reporter_skr)
);

-- Preserve existing moderation events while admitting the private-message surface.
ALTER TABLE moderation_events RENAME TO moderation_events_old;
CREATE TABLE moderation_events (
 id TEXT PRIMARY KEY, identity_skr TEXT NOT NULL REFERENCES users(skr_domain),
 surface TEXT NOT NULL CHECK(surface IN ('need','work','comment','profile','message')),
 category TEXT NOT NULL CHECK(category IN ('sexual','crime','violence','politics','hate','wallet_abuse')),
 created_at TEXT NOT NULL
);
INSERT INTO moderation_events SELECT * FROM moderation_events_old;
DROP TABLE moderation_events_old;
CREATE INDEX moderation_events_identity_idx ON moderation_events(identity_skr,created_at DESC);
CREATE INDEX moderation_events_created_idx ON moderation_events(created_at DESC);

CREATE TRIGGER messages_authorization_insert BEFORE INSERT ON messages
WHEN NOT EXISTS (
 SELECT 1 FROM conversations c JOIN users a ON a.skr_domain=c.owner_skr JOIN users b ON b.skr_domain=c.developer_skr
 WHERE c.id=NEW.conversation_id AND NEW.sender_skr IN (c.owner_skr,c.developer_skr)
 AND a.status='active' AND b.status='active'
 AND NOT EXISTS(SELECT 1 FROM user_blocks x WHERE
 (x.blocker_skr=c.owner_skr AND x.blocked_skr=c.developer_skr) OR
 (x.blocker_skr=c.developer_skr AND x.blocked_skr=c.owner_skr))
)
BEGIN SELECT RAISE(ABORT,'conversation_unavailable'); END;
