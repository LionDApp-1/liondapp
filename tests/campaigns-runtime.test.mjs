import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { operationsFixture } from './helpers/operations-fixture.mjs';

function setup() {
  const x = operationsFixture();
  x.sqlite.exec('PRAGMA foreign_keys=ON');
  for (const who of ['maker','developer','tester']) {
    if (who === 'tester') x.sqlite.prepare("INSERT INTO users(skr_domain,wallet_address,terms_version,accepted_at,created_at,updated_at) VALUES(?,?,'v1','2000','2000','2000')").run(who+'.skr',who);
    x.sqlite.prepare("INSERT INTO auth_challenges VALUES(?,?,?,'message','2000','2099',NULL)").run(who,who,who);
    x.sqlite.prepare("INSERT INTO sessions VALUES(?,?,?,?,'2000','2099',NULL)").run(createHash('sha256').update(who).digest('hex'),who,who+'.skr',who);
  }
  x.sqlite.exec("INSERT INTO store_catalog(android_package,display_name,store_url,synced_at) VALUES('app.one','Useful App','solanadappstore://details?id=app.one','2000')");
  x.env.BOUNTY_MODE = 'simulation';
  const call = (path,body=null,token='maker',method=body?'POST':'GET') => x.publicRequest(path,body,method,token);
  const okay = async (response,status=200) => {
    const r = await response, body = await r.json();
    assert.equal(r.status,status,JSON.stringify(body));
    return body;
  };
  const create = (changes={}) => okay(call('/v1/campaigns',{
    title:'Test this dApp on Seeker',description:'Test the daily interaction and share honest feedback.',
    appVersion:'1.0',requirements:'Try the daily flow. Report successes and problems.',storePackage:'app.one',
    minCharacters:100,capacity:2,reservationHours:24,rewardSkr:'10',deadline:new Date(Date.now()+7*86400_000).toISOString(),...changes,
  }),201);
  const funded = async (changes={}) => {
    const c = await create(changes);
    return okay(call(`/v1/campaigns/${c.id}/simulate-fund`,{}));
  };
  const entry = (id,token='developer') => x.sqlite.prepare('SELECT * FROM testing_entries WHERE campaign_id=? AND tester_skr=?').get(id,token+'.skr');
  const report = 'I tested the daily interaction on my Seeker. The app opened quickly and the confirmation was easy to follow. I would like a clearer retry message after a connection failure.';
  const submit = (c,token='developer') => okay(call(`/v1/testing-entries/${entry(c.id,token).id}/submit`,{revision:entry(c.id,token).revision,body:report},token));
  const review = (e,decision='approve',reason='') => okay(call(`/v1/testing-entries/${e.id}/review`,{revision:e.revision,decision,reason}));
  return {...x,call,okay,create,funded,entry,submit,review,report,clearRate:()=>x.sqlite.exec('DELETE FROM rate_limits')};
}

test('full simulated deposit, net reward, fee and unused balance refund',async()=>{
  const x=setup();try {
    const c=await x.funded();
    assert.equal(c.total_units,'22000000');assert.equal(c.reward_pool_units,'20000000');
    await x.okay(x.call(`/v1/campaigns/${c.id}/join`,{},'developer'),201);
    const submitted=await x.submit(c), approved=await x.review(submitted);
    assert.equal(approved.status,'approved');assert.equal(approved.payment_signature,null);
    const paid=await x.okay(x.call(`/v1/testing-entries/${approved.id}/simulate-settle`,{revision:approved.revision}));
    assert.equal(paid.status,'paid');assert.match(paid.payment_signature,/^simulation:/);
    assert.equal((await x.call(`/v1/testing-entries/${approved.id}/simulate-settle`,{revision:approved.revision})).status,409);
    const current=await x.okay(x.call(`/v1/campaigns/${c.id}`));
    assert.equal(current.fee_paid_units,'1000000');assert.equal(current.refundable_units,'11000000');
    await x.okay(x.call(`/v1/campaigns/${c.id}/close`,{}));
    const refunded=await x.okay(x.call(`/v1/campaigns/${c.id}/simulate-refund`,{}));
    assert.equal(refunded.refunded_units,'11000000');assert.equal(refunded.refundable_units,'0');
    assert.equal((await x.call(`/v1/campaigns/${c.id}/simulate-refund`,{})).status,409);
  }finally{x.close()}
});

test('paid drafts stay private and simulation fails closed on Mainnet or missing gate',async()=>{
  const x=setup();try {
    const c=await x.create();
    assert.equal((await x.call(`/v1/campaigns/${c.id}`,null,'developer')).status,404);
    assert.equal((await x.okay(x.call('/v1/campaigns'))).items.length,0);
    for(const state of [{BOUNTY_MODE:'disabled'},{BOUNTY_MODE:'simulation',ENVIRONMENT:'mainnet'},{ENVIRONMENT:'devnet',PAYMENT_MODE:'onchain'}]) {
      Object.assign(x.env,state);
      assert.equal((await x.call(`/v1/campaigns/${c.id}/simulate-fund`,{})).status,503);
      assert.equal((await x.okay(x.call('/v1/campaigns/config'))).paymentMode,'disabled');
    }
    assert.equal((await x.call(`/v1/campaigns/${c.id}/funding-quote`,{})).status,503);
  }finally{x.close()}
});

test('concurrent joins enforce capacity and one identity and wallet per activity',async()=>{
  const x=setup();try {
    const c=await x.funded({capacity:1});
    const results=await Promise.all(['developer','tester'].map(token=>x.call(`/v1/campaigns/${c.id}/join`,{},token)));
    assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
    assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM testing_entries WHERE campaign_id=?').get(c.id).n,1);
    const winner=x.sqlite.prepare('SELECT tester_skr FROM testing_entries').get().tester_skr.split('.')[0];
    x.clearRate();
    assert.equal((await x.call(`/v1/campaigns/${c.id}/join`,{},winner)).status,409);
    assert.equal((await x.call(`/v1/campaigns/${c.id}/join`,{})).status,400);
  }finally{x.close()}
});

test('only a successful concurrent revision produces audit and notification records',async()=>{
  const x=setup();try {
    const c=await x.funded();await x.okay(x.call(`/v1/campaigns/${c.id}/join`,{},'developer'),201);
    const e=await x.submit(c), path=`/v1/testing-entries/${e.id}/review`;
    const results=await Promise.all([x.call(path,{revision:e.revision,decision:'approve'}),x.call(path,{revision:e.revision,decision:'reject',reason:'Missing the requested result'})]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    assert.equal(x.sqlite.prepare("SELECT COUNT(*) n FROM testing_events WHERE entry_id=? AND action='review'").get(e.id).n,1);
    assert.equal(x.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE recipient_skr='developer.skr'").get().n,1);
    assert.equal((await x.call(path,{revision:e.revision,decision:'approve'})).status,409);
  }finally{x.close()}
});

test('unsettled submissions, rejections during appeal, and disputes prevent refunds',async()=>{
  const x=setup();try {
    const c=await x.funded();await x.okay(x.call(`/v1/campaigns/${c.id}/join`,{},'developer'),201);
    const e=await x.submit(c);await x.okay(x.call(`/v1/campaigns/${c.id}/close`,{}));
    const refund=()=>x.call(`/v1/campaigns/${c.id}/simulate-refund`,{});
    assert.equal((await refund()).status,409);
    const rejected=await x.review(e,'reject','Please report the requested error state.');
    assert.equal((await refund()).status,409);
    await x.okay(x.call(`/v1/testing-entries/${e.id}/appeal`,{revision:rejected.revision,reason:'My report describes the required error state.'},'developer'));
    assert.equal((await refund()).status,409);
    const disputed=x.entry(c.id);
    assert.equal(disputed.review_reason,'Please report the requested error state.');assert(disputed.appeal_reason);
    assert.equal((await x.call(`/admin/testing-entries/${e.id}/resolve`,{revision:disputed.revision,approve:true,reason:'Verified against the criteria.'})).status,401);
    const queue=await x.okay(x.request('/admin/testing-reviews'));assert.equal(queue.items.length,1);
    await x.okay(x.request(`/admin/testing-entries/${e.id}/resolve`,{revision:disputed.revision,approve:false,reason:'The required test was not performed.'}));
    assert.equal((await x.okay(refund())).refunded_units,c.total_units);
    assert.equal(x.sqlite.prepare("SELECT COUNT(*) n FROM audit_log WHERE action='testing_resolved'").get().n,1);
  }finally{x.close()}
});

test('expired slots release capacity but pending results remain protected after campaign deadline',async()=>{
  const x=setup();try {
    const c=await x.funded({capacity:1});await x.okay(x.call(`/v1/campaigns/${c.id}/join`,{},'developer'),201);
    x.sqlite.prepare("UPDATE testing_entries SET submit_by='2000'").run();
    await x.okay(x.call(`/v1/campaigns/${c.id}/join`,{},'tester'),201);
    assert.equal(x.entry(c.id).status,'expired');
    const e=await x.submit(c,'tester');
    x.sqlite.prepare("UPDATE testing_campaigns SET deadline='2000' WHERE id=?").run(c.id);
    assert.equal((await x.review(e)).status,'approved');
    await x.okay(x.call(`/v1/campaigns/${c.id}/close`,{}));
    assert.equal((await x.call(`/v1/campaigns/${c.id}/simulate-refund`,{})).status,409);
  }finally{x.close()}
});

test('one correction is allowed and overdue review enters the platform queue',async()=>{
  const x=setup();try {
    const c=await x.funded();await x.okay(x.call(`/v1/campaigns/${c.id}/join`,{},'developer'),201);
    await x.review(await x.submit(c),'changes','Please include the retry behavior.');
    const e=await x.submit(c);
    assert.equal((await x.call(`/v1/testing-entries/${e.id}/review`,{revision:e.revision,decision:'changes',reason:'More detail'})).status,409);
    x.sqlite.prepare("UPDATE testing_entries SET submitted_at='2000' WHERE id=?").run(e.id);
    assert.equal((await x.call(`/v1/testing-entries/${e.id}/review`,{revision:e.revision,decision:'approve'})).status,409);
    assert.equal((await x.okay(x.request('/admin/testing-reviews'))).items.length,1);
    await x.okay(x.request(`/admin/testing-entries/${e.id}/resolve`,{revision:e.revision,approve:true,reason:'Report satisfies the published requirements.'}));
    assert.equal(x.entry(c.id).status,'approved');
  }finally{x.close()}
});

test('validation rejects whitespace padding, unsafe evidence, invalid amounts and unlisted apps',async()=>{
  const x=setup();try {
    const c=await x.funded();await x.okay(x.call(`/v1/campaigns/${c.id}/join`,{},'developer'),201);
    const e=x.entry(c.id), path=`/v1/testing-entries/${e.id}/submit`;
    for(const body of ['a'+' \n\u200b'.repeat(100),'a'.repeat(99)]) assert.equal((await x.call(path,{revision:e.revision,body},'developer')).status,400);
    for(const evidenceUrl of ['http://example.test','https://user:pass@example.test','https://']) assert.equal((await x.call(path,{revision:e.revision,body:x.report,evidenceUrl},'developer')).status,400);
    for(const changes of [{rewardSkr:'0.0000001'},{rewardSkr:'-1'},{rewardSkr:'1e2'},{storePackage:'missing'},{capacity:1001}]) {
      x.clearRate();await assert.rejects(()=>x.create(changes));
    }
    assert.equal((await x.call(path,{revision:e.revision,body:x.report})).status,403);
  }finally{x.close()}
});

test('free invitations publish immediately and existing participants remain accessible after blocking',async()=>{
  const x=setup();try {
    const c=await x.create({rewardSkr:'0'});assert(c.post_id);assert.equal(c.funding_state,'free');
    const post=await x.okay(x.call('/v1/needs/'+c.post_id));assert.equal(post.campaign_id,c.id);assert.equal(post.campaign_reward_units,'0');
    assert.equal((await x.call('/v1/needs/'+c.post_id,{revision:1,title:'Changed terms',problem:'Different steps'},'maker','PUT')).status,409);
    assert.equal((await x.call('/v1/needs/'+c.post_id+'/follow',{wantsTest:true},'developer','PUT')).status,400);
    assert.equal((await x.call('/v1/needs/'+c.post_id,null,'maker','DELETE')).status,409);
    await x.okay(x.call(`/v1/campaigns/${c.id}/join`,{},'developer'),201);
    x.sqlite.exec("INSERT INTO user_blocks VALUES('maker.skr','developer.skr','2000')");
    assert.equal((await x.okay(x.call('/v1/campaigns?scope=joined',null,'developer'))).items.length,1);
    assert.equal((await x.okay(x.call(`/v1/campaigns/${c.id}`,null,'developer'))).id,c.id);
    const e=await x.submit(c);assert.equal((await x.review(e)).status,'paid');
    assert.equal(x.entry(c.id).payment_signature,null);
  }finally{x.close()}
});

test('account deletion cannot erase obligations and free campaigns can complete after review',async()=>{
  const x=setup();try {
    const c=await x.create({rewardSkr:'0'});
    assert.equal((await x.call('/v1/me',null,'maker','DELETE')).status,409);
    await x.okay(x.call(`/v1/campaigns/${c.id}/join`,{},'developer'),201);
    assert.equal((await x.call('/v1/me',null,'developer','DELETE')).status,409);
    assert.throws(()=>x.sqlite.exec("UPDATE users SET status='deleted' WHERE skr_domain='maker.skr'"),/testing_obligations_pending/);
    const e=await x.submit(c);await x.okay(x.call(`/v1/campaigns/${c.id}/close`,{}));
    assert.equal((await x.call(`/v1/campaigns/${c.id}/complete`,{})).status,409);
    await x.review(e);
    assert.equal((await x.okay(x.call(`/v1/campaigns/${c.id}/complete`,{}))).status,'completed');
    assert.equal((await x.call('/v1/me',null,'maker','DELETE')).status,204);
  }finally{x.close()}
});

test('moderated campaign posts stop recruiting while existing testers retain report access',async()=>{
  const x=setup();try {
    const c=await x.funded();await x.okay(x.call(`/v1/campaigns/${c.id}/join`,{},'developer'),201);
    x.sqlite.prepare("UPDATE needs SET deleted_at=? WHERE id=?").run(new Date().toISOString(),c.post_id);
    assert.equal((await x.okay(x.call('/v1/campaigns',null,'tester'))).items.length,0);
    assert.equal((await x.call(`/v1/campaigns/${c.id}/join`,{},'tester')).status,404);
    assert.equal((await x.okay(x.call(`/v1/campaigns/${c.id}`,null,'developer'))).id,c.id);
    await x.submit(c);
  }finally{x.close()}
});

test('private drafts are editable with a revision guard and published terms remain locked',async()=>{
  const x=setup();try {
    const c=await x.create();
    assert.equal(c.revision,1);assert.equal(c.locked_units,'0');assert.equal(c.refundable_units,'0');
    const changes={title:'A revised test',description:c.description,appVersion:'1.1',requirements:'Test the new retry screen and describe errors.',storePackage:'app.one',minCharacters:120,capacity:3,reservationHours:48,rewardSkr:'0.000001',deadline:new Date(Date.now()+10*86400_000).toISOString(),revision:1};
    const path='/v1/campaigns/'+c.id;
    assert.equal((await x.call(path,changes,'developer','PUT')).status,404);
    const edited=await x.okay(x.call(path,changes,'maker','PUT'));
    assert.equal(edited.revision,2);assert.equal(edited.total_units,'6');assert.notEqual(edited.rules_hash,c.rules_hash);
    assert.equal((await x.call(path,changes,'maker','PUT')).status,409);
    assert.equal(x.sqlite.prepare("SELECT COUNT(*) n FROM testing_events WHERE campaign_id=? AND action='draft_updated'").get(c.id).n,1);
    await x.okay(x.call(path+'/simulate-fund',{}));
    assert.equal((await x.call(path,{...changes,revision:2},'maker','PUT')).status,409);
  }finally{x.close()}
});

test('campaign pagination is stable with tied timestamps and does not drop history',async()=>{
  const x=setup();try {
    for(let i=0;i<5;i++){x.clearRate();await x.create({rewardSkr:'0'});}
    x.sqlite.exec("UPDATE testing_campaigns SET created_at='2026-10-06T00:00:00.000Z'");
    const seen=[];let cursor;
    do {
      const page=await x.okay(x.call('/v1/campaigns?scope=mine&limit=2'+(cursor?'&cursor='+encodeURIComponent(cursor):'')));
      seen.push(...page.items.map(i=>i.id));cursor=page.nextCursor;
    }while(cursor);
    assert.equal(seen.length,5);assert.equal(new Set(seen).size,5);
    assert.equal((await x.call('/v1/campaigns?limit=1000')).status,400);
    assert.equal((await x.call('/v1/campaigns?cursor=invalid')).status,400);
  }finally{x.close()}
});

test('blocked hosts remain hidden publicly but enrolled testers retain access to obligations',async()=>{
  const x=setup();try {
    const c=await x.create({rewardSkr:'0'});
    await x.okay(x.call('/v1/campaigns/'+c.id+'/join',{},'developer'),201);
    x.sqlite.exec("UPDATE users SET status='blocked' WHERE skr_domain='maker.skr'");
    assert.equal((await x.call('/v1/campaigns/'+c.id,null,'tester')).status,404);
    assert.equal((await x.okay(x.call('/v1/campaigns',null,'tester'))).items.length,0);
    assert.equal((await x.okay(x.call('/v1/campaigns?scope=joined',null,'developer'))).items.length,1);
    assert.equal((await x.submit(c)).status,'submitted');
  }finally{x.close()}
});

test('cancelled unfunded drafts stay private and disabled simulations are not advertised',async()=>{
  const x=setup();try {
    const c=await x.create();await x.okay(x.call('/v1/campaigns/'+c.id+'/close',{}));
    assert.equal((await x.call('/v1/campaigns/'+c.id,null,'developer')).status,404);
    const simulated=await x.funded();x.env.BOUNTY_MODE='disabled';
    assert.equal((await x.okay(x.call('/v1/campaigns',null,'developer'))).items.length,0);
    assert.equal((await x.call('/v1/campaigns/'+simulated.id+'/join',{},'developer')).status,503);
  }finally{x.close()}
});
