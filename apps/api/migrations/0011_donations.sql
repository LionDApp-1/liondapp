CREATE TABLE donation_quotes (
 id TEXT PRIMARY KEY,
 donor_skr TEXT NOT NULL REFERENCES users(skr_domain),
 wallet_address TEXT NOT NULL,
 amount_skr INTEGER NOT NULL CHECK(amount_skr BETWEEN 1 AND 1000000),
 message_base64 TEXT NOT NULL,
 transaction_base64 TEXT NOT NULL,
 last_valid_block_height INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 signature TEXT UNIQUE,
 confirmed_at TEXT
);
CREATE INDEX donation_quotes_donor_idx ON donation_quotes(donor_skr,created_at DESC);
