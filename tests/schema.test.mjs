import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const migrations = new URL("../apps/api/migrations/", import.meta.url);
const schema = readdirSync(migrations)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(new URL(name, migrations), "utf8"))
  .join("\n");

function sqlite(statements) {
  return spawnSync("sqlite3", [":memory:"], {
    input: `${schema}\n${statements}`,
    encoding: "utf8",
  });
}

const userSql = `INSERT INTO users(skr_domain,wallet_address,terms_version,accepted_at,created_at,updated_at)
  VALUES('maker.skr','11111111111111111111111111111111','v1','2026-09-06','2026-09-06','2026-09-06');`;

test("allows each signed challenge to create only one session", () => {
  const result = sqlite(`${userSql}
    INSERT INTO auth_challenges(id,wallet_address,nonce,message,issued_at,expires_at)
      VALUES('challenge','11111111111111111111111111111111','nonce','message','2026-09-06','2099-09-06');
    INSERT INTO sessions(token_hash,challenge_id,skr_domain,wallet_address,created_at,expires_at)
      VALUES('token-1','challenge','maker.skr','11111111111111111111111111111111','2026-09-06','2099-09-06');
    INSERT INTO sessions(token_hash,challenge_id,skr_domain,wallet_address,created_at,expires_at)
      VALUES('token-2','challenge','maker.skr','11111111111111111111111111111111','2026-09-06','2099-09-06');`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /UNIQUE constraint failed: sessions\.challenge_id/);
});

test("keeps active promotions out of the natural works list", () => {
  const result = sqlite(`${userSql}
    INSERT INTO works(id,author_skr,name,summary,description,store_url,category,icon_key,moderation_status,promoted_until,created_at)
      VALUES('organic','maker.skr','Organic','Summary','Description','solanadappstore://details?id=top.oneion.organic','其他','icon','published',NULL,'2026-09-06');
    INSERT INTO works(id,author_skr,name,summary,description,store_url,category,icon_key,moderation_status,promoted_until,created_at)
      VALUES('promoted','maker.skr','Promoted','Summary','Description','solanadappstore://details?id=top.oneion.promoted','其他','icon','published','2099-09-06','2026-09-06');
    SELECT id FROM works WHERE deleted_at IS NULL AND moderation_status='published'
      AND (promoted_until IS NULL OR promoted_until <= '2026-09-06') ORDER BY id;`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "organic");
});

test("maintains reaction and comment counters through database triggers", () => {
  const result = sqlite(`${userSql}
    INSERT INTO needs(id,author_skr,title,problem,solution_idea,audience,category,created_at)
      VALUES('need','maker.skr','Need','Problem','Idea','Audience','其他','2026-09-06');
    INSERT INTO comments(id,author_skr,target_type,target_id,body,created_at)
      VALUES('comment','maker.skr','need','need','Comment','2026-09-06');
    INSERT INTO reactions(identity_skr,target_type,target_id,reaction_type,created_at)
      VALUES('maker.skr','need','need','need','2026-09-06');
    INSERT INTO reactions(identity_skr,target_type,target_id,reaction_type,created_at)
      VALUES('maker.skr','comment','comment','like','2026-09-06');
    SELECT need_count,comment_count,(SELECT like_count FROM comments WHERE id='comment') FROM needs WHERE id='need';
    UPDATE comments SET deleted_at='2026-09-07' WHERE id='comment';
    DELETE FROM reactions WHERE identity_skr='maker.skr';
    SELECT need_count,comment_count,(SELECT like_count FROM comments WHERE id='comment') FROM needs WHERE id='need';`);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split("\n"), ["1|1|1", "0|0|0"]);
});

test("allows idempotent user blocking but rejects self blocking", () => {
  const result = sqlite(`${userSql}
    INSERT INTO users(skr_domain,wallet_address,terms_version,accepted_at,created_at,updated_at)
      VALUES('viewer.skr','22222222222222222222222222222222','v1','2026-09-06','2026-09-06','2026-09-06');
    INSERT INTO user_blocks(blocker_skr,blocked_skr,created_at) VALUES('viewer.skr','maker.skr','2026-09-06');
    INSERT INTO user_blocks(blocker_skr,blocked_skr,created_at) VALUES('viewer.skr','viewer.skr','2026-09-06');`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CHECK constraint failed/);
});

test("stores official catalog entries independently from community works", () => {
  const result = sqlite(`${userSql}
    INSERT INTO store_catalog(android_package,display_name,subtitle,description,store_url,synced_at)
      VALUES('com.example.catalog','Catalog App','A tool','Official description','solanadappstore://details?id=com.example.catalog','2026-09-07');
    SELECT android_package,active FROM store_catalog;`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "com.example.catalog|1");
});

test("stores cached Chinese catalog translations without replacing English source text", () => {
  const result = sqlite(`${userSql}
    INSERT INTO store_catalog(android_package,display_name,subtitle,description,subtitle_zh,description_zh,category_name_zh,translated_at,store_url,synced_at)
      VALUES('com.example.zh','Wallet App','A wallet','Manage assets','一款钱包','管理资产','工具','2026-09-09','solanadappstore://details?id=com.example.zh','2026-09-09');
    SELECT subtitle,subtitle_zh,description_zh FROM store_catalog WHERE android_package='com.example.zh';`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "A wallet|一款钱包|管理资产");
});

test("keeps structured needs compatible and constrains wild idea format", () => {
  const result = sqlite(`${userSql}
    INSERT INTO needs(id,author_skr,title,problem,solution_idea,audience,category,created_at)
      VALUES('structured','maker.skr','Need','Problem','Idea','Audience','其他','2026-09-06');
    INSERT INTO needs(id,author_skr,title,problem,solution_idea,audience,category,format,created_at)
      VALUES('wild','maker.skr','Spark','A free-form idea','','Everyone','天马行空','wild','2026-09-07');
    SELECT id,format,category FROM needs ORDER BY created_at;`);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split("\n"), ["structured|structured|其他", "wild|wild|天马行空"]);

  const invalid = sqlite(`${userSql}
    INSERT INTO needs(id,author_skr,title,problem,solution_idea,audience,category,format,created_at)
      VALUES('bad','maker.skr','Bad','Bad','','Everyone','其他','anything','2026-09-07');`);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /CHECK constraint failed/);
});
