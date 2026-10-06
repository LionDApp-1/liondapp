CREATE TABLE testing_campaigns (
  id TEXT PRIMARY KEY,
  creator_skr TEXT NOT NULL REFERENCES users(skr_domain),
  creator_wallet TEXT NOT NULL,
  store_package TEXT NOT NULL REFERENCES store_catalog(android_package),
  post_id TEXT UNIQUE REFERENCES needs(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  app_version TEXT NOT NULL,
  requirements TEXT NOT NULL,
  min_characters INTEGER NOT NULL CHECK(min_characters BETWEEN 20 AND 2000),
  capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 1000),
  reservation_hours INTEGER NOT NULL CHECK(reservation_hours BETWEEN 1 AND 72),
  reward_units TEXT NOT NULL,
  fee_units TEXT NOT NULL,
  total_units TEXT NOT NULL,
  rules_hash TEXT NOT NULL,
  deadline TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('awaiting_funding','open','closed','completed','cancelled')),
  funding_state TEXT NOT NULL CHECK(funding_state IN ('unfunded','free','simulated','confirmed')),
  funding_signature TEXT UNIQUE,
  escrow_address TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  refunded_units TEXT NOT NULL DEFAULT '0'
);
CREATE INDEX testing_campaigns_feed ON testing_campaigns(status,deadline,created_at DESC);
CREATE INDEX testing_campaigns_creator ON testing_campaigns(creator_skr,created_at DESC);

CREATE TABLE testing_entries (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES testing_campaigns(id),
  tester_skr TEXT NOT NULL REFERENCES users(skr_domain),
  tester_wallet TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('reserved','submitted','changes_requested','approved','rejected','disputed','paid','withdrawn','expired')),
  body TEXT NOT NULL DEFAULT '',
  evidence_url TEXT NOT NULL DEFAULT '',
  character_count INTEGER NOT NULL DEFAULT 0,
  review_reason TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  reserved_at TEXT NOT NULL,
  submit_by TEXT NOT NULL,
  submitted_at TEXT,
  reviewed_at TEXT,
  appeal_by TEXT,
  payment_signature TEXT UNIQUE,
  paid_at TEXT,
  UNIQUE(campaign_id,tester_skr),
  UNIQUE(campaign_id,tester_wallet)
);
CREATE INDEX testing_entries_campaign ON testing_entries(campaign_id,status);
CREATE INDEX testing_entries_tester ON testing_entries(tester_skr,reserved_at DESC);

CREATE TABLE testing_events (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES testing_campaigns(id),
  entry_id TEXT REFERENCES testing_entries(id),
  actor_skr TEXT NOT NULL,
  action TEXT NOT NULL,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX testing_events_campaign ON testing_events(campaign_id,created_at);
