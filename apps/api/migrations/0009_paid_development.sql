ALTER TABLE needs ADD COLUMN request_type TEXT NOT NULL DEFAULT 'free' CHECK (request_type IN ('free', 'paid_development'));
ALTER TABLE needs ADD COLUMN budget_skr INTEGER;
CREATE INDEX needs_paid_development_idx ON needs(request_type, budget_skr DESC, created_at DESC) WHERE deleted_at IS NULL;
