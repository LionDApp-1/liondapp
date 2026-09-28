import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync } from "node:fs";

async function loadModeration() {
  const result = await build({ entryPoints: ["apps/api/src/moderation.ts"], bundle: true, format: "esm", platform: "neutral", write: false });
  const source = Buffer.from(result.outputFiles[0].contents).toString("base64");
  return import(`data:text/javascript;base64,${source}`);
}

test("allows ordinary product requests in English and Chinese", async () => {
  const { detectContentPolicyViolation } = await loadModeration();
  assert.equal(detectContentPolicyViolation(["A wallet expense export for small teams"]), null);
  assert.equal(detectContentPolicyViolation(["希望有一个帮助老人使用钱包的工具"]), null);
});

test("blocks high-confidence sexual, criminal and political solicitation", async () => {
  const { detectContentPolicyViolation } = await loadModeration();
  assert.deepEqual(detectContentPolicyViolation(["提供招嫖服务"]), { category: "sexual" });
  assert.deepEqual(detectContentPolicyViolation(["bomb making instructions"]), { category: "crime" });
  assert.deepEqual(detectContentPolicyViolation(["这是竞选拉票平台"]), { category: "politics" });
});

test("normalization catches full-width and separator evasion", async () => {
  const { detectContentPolicyViolation } = await loadModeration();
  assert.deepEqual(detectContentPolicyViolation(["洗 钱 教 程"]), { category: "crime" });
  assert.deepEqual(detectContentPolicyViolation(["ｐｏｒｎ-download"]), { category: "sexual" });
  assert.deepEqual(detectContentPolicyViolation(["send\u200b me your seed phrase"]), { category: "wallet_abuse" });
});

test("every public text publishing surface enforces the shared policy", () => {
  const source = readFileSync("apps/api/src/index.ts", "utf8");
  for (const surface of ["need", "work", "comment", "profile"]) {
    assert.match(source, new RegExp(`enforceContentPolicy\\(env, user, "${surface}"`));
  }
});

test("moderation audit schema excludes submitted text and matched phrases", () => {
  const migration = readFileSync("apps/api/migrations/0006_content_moderation.sql", "utf8");
  assert.match(migration, /CREATE TABLE moderation_events/);
  assert.doesNotMatch(migration, /content|matched_term|matched_phrase/);
});

test("community political restrictions include simplified, traditional and invisible separators", async () => {
  const { detectContentPolicyViolation } = await loadModeration();
  for (const text of ["习近平", "习 近 平", "習\u200b近\u200b平", "共产党", "共。產。黨", "台獨", "法輪功", "CCP propaganda"]) {
    assert.deepEqual(detectContentPolicyViolation([text]), { category: "politics" }, text);
  }
  for (const text of ["支持香港台湾用户的钱包工具", "这个产品很差", "a therapist scheduling app", "an account export tool", "Scunthorpe travel guide", "shit, the app crashed"]) {
    assert.equal(detectContentPolicyViolation([text]), null, text);
  }
});
