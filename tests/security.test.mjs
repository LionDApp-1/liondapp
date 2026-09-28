import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync } from "node:fs";

async function importTypeScript(path) {
  const result = await build({ entryPoints: [path], bundle: true, format: "esm", platform: "neutral", write: false });
  const source = Buffer.from(result.outputFiles[0].contents).toString("base64");
  return import(`data:text/javascript;base64,${source}`);
}

function chunk(type, data) {
  const result = Buffer.alloc(8 + data.length + (data.length & 1));
  result.write(type, 0, 4, "ascii");
  result.writeUInt32LE(data.length, 4);
  Buffer.from(data).copy(result, 8);
  return result;
}

function webp(...chunks) {
  const payload = Buffer.concat([Buffer.from("WEBP"), ...chunks]);
  const result = Buffer.alloc(8 + payload.length);
  result.write("RIFF", 0, 4, "ascii");
  result.writeUInt32LE(payload.length, 4);
  payload.copy(result, 8);
  return new Uint8Array(result);
}

test("JSON parsing enforces a hard byte limit", async () => {
  const { readJson } = await importTypeScript("apps/api/src/http.ts");
  const request = new Request("https://api.example.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "x".repeat(100) }),
  });
  await assert.rejects(readJson(request, 32), (error) => error.status === 413 && error.code === "request_too_large");
});

test("WebP sanitation removes metadata and keeps one bounded image payload", async () => {
  const { sanitizeWebp } = await importTypeScript("apps/api/src/media.ts");
  const minimalLossless = Uint8Array.from([0x2f, 0, 0, 0, 0]);
  const sanitized = sanitizeWebp(webp(chunk("EXIF", Buffer.from("private metadata")), chunk("VP8L", minimalLossless)));
  assert.equal(Buffer.from(sanitized).includes(Buffer.from("EXIF")), false);
  assert.equal(Buffer.from(sanitized).includes(Buffer.from("private metadata")), false);
  assert.equal(Buffer.from(sanitized).includes(Buffer.from("VP8L")), true);
});

test("WebP sanitation rejects animation", async () => {
  const { sanitizeWebp } = await importTypeScript("apps/api/src/media.ts");
  assert.throws(
    () => sanitizeWebp(webp(chunk("ANIM", new Uint8Array(6)), chunk("VP8L", Uint8Array.from([0x2f, 0, 0, 0, 0])))),
    (error) => error.status === 400 && error.code === "animated_image_not_allowed",
  );
});

test("Pages security headers cover both public and operator sites", () => {
  for (const path of ["apps/site/_headers", "apps/admin/_headers"]) {
    const headers = readFileSync(path, "utf8");
    assert.match(headers, /Content-Security-Policy:/);
    assert.match(headers, /Strict-Transport-Security:/);
    assert.match(headers, /X-Content-Type-Options: nosniff/);
    assert.match(headers, /X-Frame-Options: DENY/);
  }
});

test("physical-device debug builds use the deployed HTTPS API", () => {
  const gradle = readFileSync("apps/mobile/app/build.gradle.kts", "utf8");
  assert.match(gradle, /API_BASE_URL[^\n]+https:\/\/api\.liondapp\.1ion\.top/);
  assert.doesNotMatch(gradle, /10\.0\.2\.2|usesCleartextTraffic[^\n]+true/);
});

test("media storage failures return a stable client-safe error", () => {
  const api = readFileSync("apps/api/src/index.ts", "utf8");
  assert.match(api, /media_storage_write_failed/);
  assert.match(api, /new ApiError\(503, "media_storage_unavailable"\)/);
});

test("single-image uploads use a bounded raw WebP body", async () => {
  const client = readFileSync("apps/mobile/app/src/main/java/top/oneion/liondapp/data/ApiClient.kt", "utf8");
  const api = readFileSync("apps/api/src/index.ts", "utf8");
  const { readBinary } = await importTypeScript("apps/api/src/http.ts");
  assert.match(client, /ByteArrayContent\(bytes, ContentType\.parse\(mimeType\)\)/);
  assert.doesNotMatch(client, /MultiPartFormDataContent/);
  assert.match(api, /contentType\.startsWith\("image\/webp"\)/);
  const body = Uint8Array.from([1, 2, 3, 4]);
  const request = new Request("https://api.example.test/v1/media", { method: "POST", headers: { "content-type": "image/webp" }, body });
  assert.deepEqual(await readBinary(request, 4), body);
  const oversized = new Request("https://api.example.test/v1/media", { method: "POST", headers: { "content-type": "image/webp" }, body });
  await assert.rejects(readBinary(oversized, 3), (error) => error.status === 413 && error.code === "request_too_large");
});

test("credentialed identity RPC is never stored in Wrangler source config", () => {
  const wrangler = readFileSync("apps/api/wrangler.toml", "utf8");
  assert.doesNotMatch(wrangler, /^IDENTITY_RPC_URL\s*=/m);
});

test("MWA activity result sender is registered before Compose starts", () => {
  const activity = readFileSync("apps/mobile/app/src/main/java/top/oneion/liondapp/MainActivity.kt", "utf8");
  const wallet = readFileSync("apps/mobile/app/src/main/java/top/oneion/liondapp/wallet/WalletAuthManager.kt", "utf8");
  const senderIndex = activity.indexOf("ActivityResultSender(this)");
  const composeIndex = activity.indexOf("setContent {");
  assert.ok(senderIndex >= 0 && senderIndex < composeIndex);
  assert.doesNotMatch(wallet, /ActivityResultSender\(activity\)/);
});

test("expired sessions cannot hide public content and are cleared on device", () => {
  const auth = readFileSync("apps/api/src/auth.ts", "utf8");
  const optionalSession = auth.slice(auth.indexOf("export async function optionalSession"), auth.indexOf("export async function resolveSkrDomain"));
  const viewModel = readFileSync("apps/mobile/app/src/main/java/top/oneion/liondapp/LionViewModel.kt", "utf8");
  assert.match(optionalSession, /error instanceof ApiError && error\.status === 401/);
  assert.match(optionalSession, /return null/);
  assert.match(viewModel, /private fun clearExpiredSession/);
  assert.match(viewModel, /api\.sessionToken = null/);
  assert.match(viewModel, /sessions\.clear\(\)/);
  assert.match(viewModel, /"invalid_session"/);
});

test("wild ideas have a reduced server-enforced payload", async () => {
  const { needPayload } = await importTypeScript("apps/api/src/validation.ts");
  const payload = needPayload({
    format: "wild",
    title: "A pocket-sized city",
    problem: "A free-form idea without a prescribed implementation.",
    audience: "Curious travelers",
    category: "DeFi",
    solutionIdea: "ignored",
    tags: ["ignored"],
  });
  assert.equal(payload.format, "wild");
  assert.equal(payload.category, "天马行空");
  assert.equal(payload.solutionIdea, "");
  assert.deepEqual(payload.tags, []);
  assert.throws(() => needPayload({ format: "anything" }), (error) => error.code === "invalid_need_format");
});
