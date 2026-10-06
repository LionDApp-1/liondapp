-- Only private, unfunded drafts are editable. Published terms remain immutable.
ALTER TABLE testing_campaigns ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
INSERT INTO config(key,value,updated_at) VALUES('terms_version','2026-10-06',strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at;
