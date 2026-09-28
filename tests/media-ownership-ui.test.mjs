import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const admin = readFileSync("apps/admin/assets/admin.js", "utf8");
const mobile = readFileSync("apps/mobile/app/src/main/java/top/oneion/liondapp/ui/LionDApp.kt", "utf8");
const gradle = readFileSync("apps/mobile/app/build.gradle.kts", "utf8");
const catalog = readFileSync("apps/api/src/store-catalog.ts", "utf8");

test("admin and mobile preserve slash-separated R2 media keys", () => {
  assert.match(admin, /split\("\/"\)\.map\(encodeURIComponent\)\.join\("\/"\)/);
  assert.doesNotMatch(admin, /\/api\/media\/\$\{encodeURIComponent\(key\)\}/);
  assert.match(mobile, /key\.split\("\/"\)\.joinToString\("\/"\) \{ Uri\.encode\(it\) \}/);
});

test("Coil includes its explicit network image fetcher", () => {
  assert.match(gradle, /coil-network-okhttp:3\.2\.0/);
});

test("published work controls remain owner-only", () => {
  assert.match(mobile, /val isOwner = state\.skrDomain != null && target\.author == state\.skrDomain/);
  assert.match(mobile, /target\.kind == "work" && isOwner\) IconButton\(\{ confirmDelete = true \}/);
  assert.match(mobile, /target\.moderationStatus == "published" && !promotionActive/);
  assert.match(mobile, /viewModel\.deleteWork\(target\.id\) \{ deleted -> if \(deleted\) onClose\(\) \}/);
});

test("Chinese Store copy uses cached translations with English fallback", () => {
  for (const field of ["subtitleZh", "descriptionZh", "categoryNameZh"]) assert.match(mobile, new RegExp(field));
  assert.match(mobile, /descriptionZh\?\.takeIf\(String::isNotBlank\) \?: description/);
  assert.match(catalog, /translated_at IS NULL/);
  assert.match(catalog, /LIKE '%wallet%'.*rating DESC NULLS LAST/s);
  assert.match(catalog, /Math\.min\(Math\.max\(Math\.trunc\(limit\), 1\), 10\)/);
});
