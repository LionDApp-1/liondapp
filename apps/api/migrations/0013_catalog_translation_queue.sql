ALTER TABLE store_catalog ADD COLUMN translation_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE store_catalog ADD COLUMN translation_retry_at TEXT;
CREATE TABLE catalog_translation_lock (id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,expires_at TEXT NOT NULL);
INSERT OR IGNORE INTO config(key,value,updated_at) VALUES('catalog_translation_enabled','true',datetime('now'));
UPDATE store_catalog SET translated_at=NULL,description_zh=NULL WHERE length(description)>5000;
