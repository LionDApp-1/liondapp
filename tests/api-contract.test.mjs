import test from "node:test";
import assert from "node:assert/strict";
import { categories, validateNeedPayload, validateWorkPayload } from "../packages/core/api-contract.mjs";

test("contains the agreed categories", () => {
  assert.deepEqual(categories, ["天马行空", "DeFi", "支付", "游戏", "NFT", "社交", "DePIN", "AI", "效率工具", "开发者工具", "教育", "其他"]);
});

test("validates a complete need", () => {
  assert.deepEqual(validateNeedPayload({ title: "Better receipts", problem: "Hard to reconcile", solutionIdea: "Exportable receipts", audience: "Mobile users", category: "支付", tags: ["wallet"], mediaKeys: [] }), []);
});

test("rejects more than five tags or any need images", () => {
  const errors = validateNeedPayload({ title: "x", problem: "x", solutionIdea: "x", audience: "x", category: "其他", tags: ["1", "2", "3", "4", "5", "6"], mediaKeys: ["1"] });
  assert.deepEqual(errors.sort(), ["mediaKeys", "tags"]);
});

test("validates a reduced wild idea payload", () => {
  assert.deepEqual(validateNeedPayload({ format: "wild", title: "Flying library", problem: "Books find readers", audience: "Everyone", tags: [] }), []);
});

test("validates a work without requiring a Store deep link", () => {
  const valid = { name: "Work", summary: "Useful", description: "Details", category: "效率工具", tags: [], iconKey: "icon", screenshotKeys: ["screen-1", "screen-2"] };
  assert.deepEqual(validateWorkPayload(valid), []);
  assert.ok(validateWorkPayload({ ...valid, screenshotKeys: ["screen-1"] }).includes("media"));
});
