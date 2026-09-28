ALTER TABLE store_catalog ADD COLUMN subtitle_zh TEXT;
ALTER TABLE store_catalog ADD COLUMN description_zh TEXT;
ALTER TABLE store_catalog ADD COLUMN category_name_zh TEXT;
ALTER TABLE store_catalog ADD COLUMN translated_at TEXT;
CREATE INDEX store_catalog_translation_idx ON store_catalog(active, translated_at);
