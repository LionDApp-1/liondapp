ALTER TABLE store_catalog ADD COLUMN sync_generation TEXT;
CREATE INDEX store_catalog_generation_idx ON store_catalog(sync_generation);
