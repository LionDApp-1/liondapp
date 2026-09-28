CREATE TABLE catalog_translation_daily (
  day TEXT PRIMARY KEY,
  calls INTEGER NOT NULL DEFAULT 0,
  paused INTEGER NOT NULL DEFAULT 0 CHECK(paused IN (0,1))
);
CREATE TABLE catalog_translation_cache (
  cache_key TEXT PRIMARY KEY,
  translated_text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
