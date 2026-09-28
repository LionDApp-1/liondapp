CREATE TABLE store_catalog (
  android_package TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  category_id TEXT,
  category_name TEXT,
  icon_url TEXT,
  publisher_name TEXT,
  publisher_website TEXT,
  store_url TEXT NOT NULL,
  rating REAL,
  review_count INTEGER NOT NULL DEFAULT 0,
  source_updated_at TEXT,
  synced_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);
CREATE INDEX store_catalog_active_idx ON store_catalog(active, display_name);
CREATE INDEX store_catalog_search_idx ON store_catalog(display_name, subtitle, description);
