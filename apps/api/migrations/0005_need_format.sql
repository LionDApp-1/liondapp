ALTER TABLE needs ADD COLUMN format TEXT NOT NULL DEFAULT 'structured'
  CHECK (format IN ('structured', 'wild'));
CREATE INDEX needs_format_latest_idx ON needs(format, created_at DESC) WHERE deleted_at IS NULL;
