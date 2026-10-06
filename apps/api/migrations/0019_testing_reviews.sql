ALTER TABLE testing_entries ADD COLUMN correction_count INTEGER NOT NULL DEFAULT 0 CHECK(correction_count BETWEEN 0 AND 1);
ALTER TABLE testing_entries ADD COLUMN appeal_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE testing_entries ADD COLUMN resolution_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE testing_entries ADD COLUMN mutation_id TEXT;
CREATE UNIQUE INDEX testing_entries_mutation ON testing_entries(mutation_id);

CREATE TRIGGER testing_account_obligations BEFORE UPDATE OF status ON users
WHEN NEW.status='deleted' AND (
  EXISTS(SELECT 1 FROM testing_campaigns c WHERE c.creator_skr=OLD.skr_domain AND c.status NOT IN ('completed','cancelled'))
  OR EXISTS(SELECT 1 FROM testing_entries e WHERE e.tester_skr=OLD.skr_domain
    AND e.status NOT IN ('paid','withdrawn','expired') AND NOT(e.status='rejected' AND e.appeal_by<=strftime('%Y-%m-%dT%H:%M:%fZ','now')))
)
BEGIN SELECT RAISE(ABORT,'testing_obligations_pending'); END;
