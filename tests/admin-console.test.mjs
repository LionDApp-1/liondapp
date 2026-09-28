import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("apps/admin/index.html", "utf8");
const css = readFileSync("apps/admin/assets/admin.css", "utf8");
const js = readFileSync("apps/admin/assets/admin.js", "utf8");
const api = readFileSync("apps/api/src/index.ts", "utf8");

test("operator console covers the required operating surfaces", () => {
  for (const view of ["overview", "works", "content", "reports", "people", "promotions", "system"]) {
    assert.match(html, new RegExp(`id="${view}"`));
  }
  for (const endpoint of ["overview", "needs", "comments", "users", "promotions", "audit", "announcements", "store-catalog/status", "store-catalog/translate"]) {
    assert.match(api, new RegExp(`/admin/${endpoint.replace("/", "\\/")}`));
  }
});

test("operator people and promotion queries exclude wallet and session secrets", () => {
  const peopleRoute = api.slice(api.indexOf('path === "/admin/users"'), api.indexOf('path === "/admin/promotions"'));
  const promotionRoute = api.slice(api.indexOf('path === "/admin/promotions"'), api.indexOf('path === "/admin/audit"'));
  assert.doesNotMatch(peopleRoute, /wallet_address|token_hash|signature/);
  assert.doesNotMatch(promotionRoute, /wallet_address|token_hash|signature/);
});

test("operator console has responsive navigation and confirmation dialogs", () => {
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(html, /id="confirm-dialog"/);
  assert.match(js, /function askConfirm/);
  assert.match(js, /audit log/i);
});

test("operator console JavaScript parses and every static translation key is bilingual", () => {
  assert.doesNotThrow(() => new Function(js));
  const keys = [...html.matchAll(/data-i18n(?:-placeholder|-aria|-title)?="([^"]+)"/g)].map((match) => match[1]);
  for (const key of new Set(keys)) {
    assert.equal((js.match(new RegExp(`"${key.replace(/[.*+?^${ }()|[\]\\]/g, "\\$&")}":`, "g")) || []).length, 2, `missing bilingual text for ${key}`);
  }
});

test("operator console persists language and exposes a protected re-login path", () => {
  assert.match(html, /data-language="en"/);
  assert.match(html, /data-language="zh"/);
  assert.match(js, /localStorage\.setItem\("liondapp-admin-language"/);
  assert.match(html, /id="auth-required"/);
  assert.match(js, /admin_authentication_required/);
  assert.match(js, /https:\/\/admin\.liondapp\.1ion\.top/);
});

test("critical operator actions have bound handlers and busy protection", () => {
  for (const marker of ["data-review", "data-remove", "data-report", "data-identity", "data-announcement-delete"]) {
    assert.match(js, new RegExp(`\\[${marker}\\]`));
  }
  assert.match(js, /function withBusy/);
  assert.match(js, /price-form.*addEventListener\("submit"/s);
  assert.match(js, /announcement-form.*addEventListener\("submit"/s);
  assert.match(js, /sync-catalog.*addEventListener\("click"/s);
  assert.match(js, /translate-catalog.*addEventListener\("click"/s);
});

test("catalog translation is explicitly scoped to LionDApp", () => {
  assert.match(js, /Generate LionDApp Chinese results/);
  assert.match(js, /official Store is not changed/);
  assert.match(js, /生成 LionDApp 中文搜索结果/);
  assert.match(js, /不会修改官方 dApp 商店/);
});
