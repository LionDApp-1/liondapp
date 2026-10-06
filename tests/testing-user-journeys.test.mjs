import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { operationsFixture } from './helpers/operations-fixture.mjs';

const content = JSON.parse(readFileSync(new URL('./fixtures/testing-user-journeys.json', import.meta.url)));
function setup() {
  const x = operationsFixture();
  x.sqlite.exec('PRAGMA foreign_keys=ON');
  for (const who of ['maker', 'developer', 'tester']) {
    if (who === 'tester') x.sqlite.prepare("INSERT INTO users(skr_domain,wallet_address,terms_version,accepted_at,created_at,updated_at) VALUES(?,?,'v1','2000','2000','2000')").run(who + '.skr', who);
    x.sqlite.prepare("INSERT INTO auth_challenges VALUES(?,?,?,'message','2000','2099',NULL)").run(who, who, who);
    x.sqlite.prepare("INSERT INTO sessions VALUES(?,?,?,?,'2000','2099',NULL)").run(createHash('sha256').update(who).digest('hex'), who, who + '.skr', who);
  }
  x.env.BOUNTY_MODE = 'disabled';
  x.sqlite.exec("INSERT INTO store_catalog(android_package,display_name,store_url,synced_at) VALUES('top.lionance.app','Lionance','solanadappstore://details?id=top.lionance.app','2000')");
  const call = (path, body = null, who = 'maker', method = body ? 'POST' : 'GET') => x.publicRequest(path, body, method, who);
  const okay = async (response, status = 200) => {
    const result = await response, body = await result.json();
    assert.equal(result.status, status, JSON.stringify(body));
    return body;
  };
  const create = (changes = {}) => okay(call('/v1/campaigns', {
    ...content.campaign, storePackage: 'top.lionance.app', deadline: new Date(Date.now() + 86400_000).toISOString(), ...changes,
  }), 201);
  const join = (campaign, who = 'developer') => okay(call(`/v1/campaigns/${campaign.id}/join`, {}, who), 201);
  const entry = (campaign, who = 'developer') => x.sqlite.prepare('SELECT * FROM testing_entries WHERE campaign_id=? AND tester_skr=?').get(campaign.id, who + '.skr');
  const submit = (campaign, body, who = 'developer', revision = entry(campaign, who).revision) => okay(call(`/v1/testing-entries/${entry(campaign, who).id}/submit`, { revision, body }, who));
  const review = (e, decision, reason = '') => okay(call(`/v1/testing-entries/${e.id}/review`, { revision: e.revision, decision, reason }));
  return { ...x, call, okay, create, join, entry, submit, review, clearRate: () => x.sqlite.exec('DELETE FROM rate_limits') };
}

test('free realistic journey: negative finding qualifies, missing steps get one correction, no fake payment', async () => {
  const x = setup(); try {
    const c = await x.create();
    assert.equal(c.funding_state, 'free'); assert.equal(c.reward_units, '0'); assert.equal(c.total_units, '0');
    const publicPost = await x.okay(x.call('/v1/needs/' + c.post_id));
    assert.equal(publicPost.problem, content.campaign.description);
    assert.equal(publicPost.solution_idea, content.campaign.requirements);
    const hash = c.rules_hash;
    assert.equal((await x.call(`/v1/campaigns/${c.id}/join`, {})).status, 400);
    await x.join(c); await x.join(c, 'tester');
    const incomplete = await x.submit(c, content.reports.incomplete);
    const correction = await x.review(incomplete, 'changes', content.review.correction);
    assert.equal(correction.status, 'changes_requested'); assert.equal(correction.correction_count, 1);
    const corrected = await x.submit(c, content.reports.corrected);
    assert.equal(corrected.body, content.reports.corrected);
    assert.equal((await x.call(`/v1/testing-entries/${corrected.id}/review`, { revision: corrected.revision, decision: 'changes', reason: content.review.correction })).status, 409);
    const approved = await x.review(corrected, 'approve');
    assert.equal(approved.status, 'paid'); assert.equal(approved.payment_signature, null);
    const negative = await x.submit(c, content.reports.negative, 'tester');
    assert.equal((await x.review(negative, 'approve')).status, 'paid');
    await x.okay(x.call(`/v1/campaigns/${c.id}/close`, {}));
    const completed = await x.okay(x.call(`/v1/campaigns/${c.id}/complete`, {}));
    assert.equal(completed.status, 'completed'); assert.equal(completed.rules_hash, hash);
    assert.equal(completed.fee_paid_units, '0');
    for (const who of ['developer', 'tester']) assert.equal(x.entry(c, who).payment_signature, null);
    assert.equal((await x.okay(x.call('/v1/campaigns?scope=joined', null, 'developer'))).items[0].id, c.id);
    assert.equal(x.sqlite.prepare("SELECT COUNT(*) n FROM testing_events WHERE campaign_id=? AND action='review'").get(c.id).n, 3);
  } finally { x.close(); }
});

test('lost response retry cannot duplicate a long report, review, audit or notification', async () => {
  const x = setup(); try {
    const c = await x.create({ capacity: 1 }); await x.join(c);
    const before = x.entry(c), submitted = await x.submit(c, content.reports.longEnglish);
    // The server accepted the first request but the client did not receive its response.
    const retry = await x.call(`/v1/testing-entries/${before.id}/submit`, { revision: before.revision, body: content.reports.longEnglish }, 'developer');
    assert.equal(retry.status, 409);
    const restored = await x.okay(x.call(`/v1/campaigns/${c.id}`, null, 'developer'));
    assert.equal(restored.own_entry.body, content.reports.longEnglish);
    assert.equal(restored.own_entry.revision, submitted.revision);
    assert.equal(x.sqlite.prepare("SELECT COUNT(*) n FROM testing_events WHERE entry_id=? AND action='submit'").get(before.id).n, 1);
    assert.equal(x.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE recipient_skr='maker.skr'").get().n, 1);
    const decisions = await Promise.all([
      x.call(`/v1/testing-entries/${before.id}/review`, { revision: submitted.revision, decision: 'approve' }),
      x.call(`/v1/testing-entries/${before.id}/review`, { revision: submitted.revision, decision: 'approve' }),
    ]);
    assert.deepEqual(decisions.map(r => r.status).sort(), [200, 409]);
    assert.equal(x.sqlite.prepare("SELECT COUNT(*) n FROM testing_events WHERE entry_id=? AND action='review'").get(before.id).n, 1);
    assert.equal(x.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE recipient_skr='developer.skr'").get().n, 1);
    assert.equal(x.entry(c).payment_signature, null);
  } finally { x.close(); }
});

test('a criteria-based appeal keeps a negative report and review reasons available until independent resolution', async () => {
  const x = setup(); try {
    const c = await x.create(); await x.join(c);
    const submitted = await x.submit(c, content.reports.negative);
    const rejected = await x.review(submitted, 'reject', content.review.unfairRejection);
    assert.equal(rejected.status, 'rejected');
    const appealed = await x.okay(x.call(`/v1/testing-entries/${submitted.id}/appeal`, { revision: rejected.revision, reason: content.review.appeal }, 'developer'));
    assert.equal(appealed.status, 'disputed');
    await x.okay(x.call(`/v1/campaigns/${c.id}/close`, {}));
    assert.equal((await x.call(`/v1/campaigns/${c.id}/complete`, {})).status, 409);
    const queue = await x.okay(x.request('/admin/testing-reviews'));
    const item = queue.items.find(e => e.id === submitted.id);
    assert.equal(item.body, content.reports.negative);
    assert.equal(item.review_reason, content.review.unfairRejection);
    assert.equal(item.appeal_reason, content.review.appeal);
    assert.equal(item.requirements, content.campaign.requirements);
    const resolution = await x.okay(x.request(`/admin/testing-entries/${submitted.id}/resolve`, { revision: appealed.revision, approve: true, reason: content.review.resolution }));
    assert.equal(resolution.status, 'paid');
    assert.equal(x.entry(c).resolution_reason, content.review.resolution); assert.equal(x.entry(c).payment_signature, null);
    assert.equal((await x.okay(x.call(`/v1/campaigns/${c.id}/complete`, {}))).status, 'completed');
  } finally { x.close(); }
});

test('a tester can leave an unfinished task; the next tester takes the released place without seeing the private report', async () => {
  const x = setup(); try {
    const c = await x.create({ capacity: 1 }); await x.join(c);
    assert.equal((await x.call(`/v1/campaigns/${c.id}/join`, {}, 'tester')).status, 409);
    const first = x.entry(c);
    await x.okay(x.call(`/v1/testing-entries/${first.id}/withdraw`, { revision: first.revision }, 'developer'));
    // Admission attempts also consume the cooldown, including a full-capacity
    // failure. Retry must wait rather than bypass the production rate limit.
    assert.equal((await x.call(`/v1/campaigns/${c.id}/join`, {}, 'tester')).status, 429);
    x.clearRate(); // Advance past cooldown in the isolated fixture, not online.
    await x.join(c, 'tester');
    const submitted = await x.submit(c, content.reports.networkRecovery, 'tester');
    const outsider = await x.okay(x.call(`/v1/campaigns/${c.id}`, null, 'developer'));
    assert.equal(outsider.own_entry.status, 'withdrawn'); assert(!outsider.own_entry.body);
    assert.equal((await x.call(`/v1/campaigns/${c.id}/entries`, null, 'developer')).status, 403);
    assert.equal((await x.call(`/v1/testing-entries/${submitted.id}/review`, { revision: submitted.revision, decision: 'approve' }, 'developer')).status, 404);
    assert.equal((await x.review(submitted, 'approve')).status, 'paid');
  } finally { x.close(); }
});
