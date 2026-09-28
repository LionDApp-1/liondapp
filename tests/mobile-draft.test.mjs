import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("apps/mobile/app/src/main/java/top/oneion/liondapp/ui/LionDApp.kt", "utf8");
const manifest = readFileSync("apps/mobile/app/src/main/AndroidManifest.xml", "utf8");

test("composer cannot be dismissed by tapping outside", () => {
  assert.match(source, /DialogProperties\([^)]*dismissOnClickOutside = false[^)]*usePlatformDefaultWidth = false/s);
});

test("work text and selected media survive activity recreation", () => {
  for (const field of ["name", "summary", "description", "demoUrl", "category", "tags", "media"]) {
    assert.match(source, new RegExp(`var ${field} by rememberSaveable`));
  }
});

test("dirty composers require explicit draft discard confirmation", () => {
  assert.match(source, /Discard draft\?/);
  assert.match(source, /if \(hasDraft\) confirmDiscard = true else close\(\)/);
});

test("work composer does not require a Store deep link", () => {
  const composer = source.slice(source.indexOf("private fun WorkComposer"), source.indexOf("private fun ComposerShell"));
  assert.doesNotMatch(composer, /storeUrl|Store deep link|商店深链|Open Solana dApp Store/);
  assert.doesNotMatch(manifest, /<package android:name="com\.solanamobile\.dappstore" \/>/);
});

test("work composer requires and labels 3 to 6 images", () => {
  assert.match(source, /media\.size !in 3\.\.6/);
  assert.match(source, /at least 3/);
  assert.match(source, /至少 3 张/);
});

test("work validation explains missing fields instead of silently disabling submit", () => {
  assert.match(source, /Complete: /);
  assert.match(source, /请补充：/);
  assert.match(source, /if \(missing\.isNotEmpty\(\)\) showValidation = true/);
  assert.match(source, /navigationBarsPadding\(\)/);
});

test("work submission exposes upload progress, creation, success, error, and retry states", () => {
  const viewModel = readFileSync("apps/mobile/app/src/main/java/top/oneion/liondapp/LionViewModel.kt", "utf8");
  for (const phase of ["Idle", "Uploading", "Creating", "Success", "Error"]) {
    assert.match(viewModel, new RegExp(`WorkSubmissionPhase\\.${phase}|enum class WorkSubmissionPhase \\{[^}]*${phase}`, "s"));
  }
  assert.match(source, /Processing and uploading image/);
  assert.match(source, /Creating the review record/);
  assert.match(source, /Submitted for review/);
  assert.match(source, /Retry submission/);
  assert.match(source, /your draft is preserved/i);
  for (const code of ["image_permission_lost", "network_timeout", "network_dns", "network_tls", "media_storage_unavailable"]) {
    assert.match(source, new RegExp(code));
  }
  assert.match(viewModel, /uploadImageWithRetry/);
  assert.match(viewModel, /LionDAppUpload/);
});

test("successful work submission stays visible until the user acknowledges it", () => {
  assert.match(source, /if \(succeeded\)[\s\S]*Button\(close/);
  assert.doesNotMatch(source, /publishWork\(request, media\) \{ if \(it\) \{ showWorkComposer = false/);
});
