ALTER TABLE needs ADD COLUMN kind TEXT NOT NULL DEFAULT 'need' CHECK(kind IN ('need','feedback'));
ALTER TABLE needs ADD COLUMN feedback_type TEXT CHECK(feedback_type IN ('issue','suggestion','praise'));
ALTER TABLE needs ADD COLUMN store_package TEXT REFERENCES store_catalog(android_package);
ALTER TABLE needs ADD COLUMN status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','needs_info','suggested','testing','resolved','unresolved'));
ALTER TABLE needs ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE needs ADD COLUMN updated_at TEXT;
ALTER TABLE needs ADD COLUMN last_event_id TEXT;
ALTER TABLE works ADD COLUMN store_package TEXT REFERENCES store_catalog(android_package);
ALTER TABLE comments ADD COLUMN response_kind TEXT NOT NULL DEFAULT 'discussion' CHECK(response_kind IN ('discussion','clarification','suggestion','progress','testing','outcome'));
ALTER TABLE comments ADD COLUMN linked_store_package TEXT REFERENCES store_catalog(android_package);
ALTER TABLE comments ADD COLUMN linked_work_id TEXT REFERENCES works(id);
ALTER TABLE comments ADD COLUMN outcome_status TEXT;

CREATE INDEX needs_app_idx ON needs(store_package,created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX needs_status_idx ON needs(status,created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX works_app_idx ON works(store_package) WHERE deleted_at IS NULL;

CREATE TABLE need_followers (
  need_id TEXT NOT NULL REFERENCES needs(id),
  identity_skr TEXT NOT NULL REFERENCES users(skr_domain),
  wants_test INTEGER NOT NULL DEFAULT 0 CHECK(wants_test IN (0,1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY(need_id,identity_skr)
);
CREATE INDEX need_followers_identity_idx ON need_followers(identity_skr,created_at DESC);

CREATE TABLE app_followers (
  store_package TEXT NOT NULL REFERENCES store_catalog(android_package),
  identity_skr TEXT NOT NULL REFERENCES users(skr_domain),
  created_at TEXT NOT NULL,
  PRIMARY KEY(store_package,identity_skr)
);
CREATE INDEX app_followers_identity_idx ON app_followers(identity_skr,created_at DESC);

CREATE TABLE need_revisions (
  id TEXT PRIMARY KEY,
  need_id TEXT NOT NULL REFERENCES needs(id),
  revision INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(need_id,revision)
);

DROP VIEW operations_project_index;
CREATE VIEW operations_project_index AS
WITH source AS (
  SELECT 'need' AS target_type,id,title,author_skr,category,problem AS summary,
    status AS public_status,request_type,budget_skr,created_at,need_count AS reactions,comment_count,
    json_object('title',title,'problem',problem,'solution_idea',solution_idea,'audience',audience,'tags_json',tags_json) AS policy_fields,
    kind AS content_kind,feedback_type,store_package,(SELECT display_name FROM store_catalog WHERE android_package=store_package) AS app_name
  FROM needs WHERE deleted_at IS NULL
  UNION ALL
  SELECT 'work',id,name,author_skr,category,summary,moderation_status,'work',NULL,created_at,like_count,comment_count,
    json_object('name',name,'summary',summary,'description',description,'tags_json',tags_json,'demo_url',demo_url),
    'work',NULL,store_package,(SELECT display_name FROM store_catalog WHERE android_package=store_package)
  FROM works WHERE deleted_at IS NULL
)
SELECT s.*,COALESCE(o.stage,CASE WHEN s.target_type='work' AND s.public_status!='pending' THEN 'done' ELSE 'new' END) AS stage,
  COALESCE(o.assignee,'') AS assignee,o.due_at,COALESCE(o.note,'') AS note,
  COALESCE(o.stage_since,s.created_at) AS stage_since,COALESCE(o.updated_at,s.created_at) AS updated_at,
  COALESCE(o.revision,0) AS revision
FROM source s LEFT JOIN operations_projects o ON s.target_type=o.target_type AND s.id=o.target_id;
