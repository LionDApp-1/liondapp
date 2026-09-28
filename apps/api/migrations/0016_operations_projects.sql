-- Internal follow-up only: never certifies development progress, payment or delivery.
CREATE TABLE operations_projects (
  target_type TEXT NOT NULL CHECK(target_type IN ('need','work')),
  target_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK(stage IN ('new','in_progress','waiting','done')),
  assignee TEXT NOT NULL DEFAULT '' CHECK(length(assignee)<=80),
  due_at TEXT,
  note TEXT NOT NULL DEFAULT '' CHECK(length(note)<=2000),
  stage_since TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  mutation_id TEXT NOT NULL,
  PRIMARY KEY(target_type,target_id)
);
CREATE INDEX operations_projects_owner ON operations_projects(assignee,stage,due_at);

CREATE VIEW operations_project_index AS
WITH source AS (
  SELECT 'need' AS target_type,id,title,author_skr,category,problem AS summary,
    'recorded' AS public_status,request_type,budget_skr,created_at,need_count AS reactions,comment_count,
    json_object('title',title,'problem',problem,'solution_idea',solution_idea,'audience',audience,'tags_json',tags_json) AS policy_fields
  FROM needs WHERE deleted_at IS NULL
  UNION ALL
  SELECT 'work',id,name,author_skr,category,summary,moderation_status,'work',NULL,created_at,like_count,comment_count,
    json_object('name',name,'summary',summary,'description',description,'tags_json',tags_json,'demo_url',demo_url)
  FROM works WHERE deleted_at IS NULL
)
SELECT s.*, COALESCE(o.stage,CASE WHEN s.target_type='work' AND s.public_status!='pending' THEN 'done' ELSE 'new' END) AS stage,
  COALESCE(o.assignee,'') AS assignee,o.due_at,COALESCE(o.note,'') AS note,
  COALESCE(o.stage_since,s.created_at) AS stage_since,COALESCE(o.updated_at,s.created_at) AS updated_at,
  COALESCE(o.revision,0) AS revision
FROM source s LEFT JOIN operations_projects o ON s.target_type=o.target_type AND s.id=o.target_id;

CREATE TRIGGER operations_work_review AFTER UPDATE OF moderation_status ON works
WHEN NEW.moderation_status!=OLD.moderation_status
BEGIN
  UPDATE operations_projects SET stage=CASE WHEN NEW.moderation_status='pending' THEN 'new' ELSE 'done' END,
    stage_since=COALESCE(NEW.reviewed_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at=COALESCE(NEW.reviewed_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),revision=revision+1
  WHERE target_type='work' AND target_id=NEW.id;
END;
