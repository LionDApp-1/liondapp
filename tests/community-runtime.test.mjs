import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { operationsFixture } from './helpers/operations-fixture.mjs';

function setup() {
  const x=operationsFixture();
  x.sqlite.exec("PRAGMA foreign_keys=ON");
  for(const who of ['maker','developer']) {
    x.sqlite.prepare("INSERT INTO auth_challenges VALUES(?,?,?,'message','2000','2099',NULL)").run(who,who,who);
    x.sqlite.prepare("INSERT INTO sessions VALUES(?,?,?,?, '2000','2099',NULL)").run(createHash('sha256').update(who).digest('hex'),who,who+'.skr',who);
  }
  x.sqlite.exec("INSERT INTO store_catalog(android_package,display_name,store_url,synced_at) VALUES('app.one','Useful App','solanadappstore://details?id=app.one','2000');");
  const call=(path,body=null,method=body?'POST':'GET',token='maker')=>x.publicRequest(path,body,method,token);
  const create=async(body)=>{
    x.sqlite.exec('DELETE FROM rate_limits');
    const r=await call('/v1/needs',{title:'Mobile experience',problem:'The app is hard to use',...body});
    assert.equal(r.status,201,JSON.stringify(await r.clone().json()));return (await r.json()).id;
  };
  return {...x,call,create,clearRate:()=>x.sqlite.exec('DELETE FROM rate_limits')};
}

test('feedback validates a live catalog app, supports praise/criticism and keeps legacy records',async()=>{
  const x=setup();try {
    x.need('legacy');
    for(const type of ['issue','suggestion','praise']) {
      const id=await x.create({kind:'feedback',feedbackType:type,storePackage:'app.one'});
      const need=await (await x.call('/v1/needs/'+id)).json();
      assert.equal(need.app_name,'Useful App');assert.equal(need.feedback_type,type);assert.equal(need.solution_idea,'');
    }
    for(const body of [{kind:'feedback'},{kind:'feedback',storePackage:'missing'},{kind:'feedback',storePackage:'app.one',feedbackType:'invalid'},{kind:'feedback',storePackage:'app.one',format:'wild'}]) {
      x.clearRate();assert.equal((await x.call('/v1/needs',{title:'Title',problem:'A problem',...body})).status,400);
    }
    const app=await (await x.call('/v1/store-apps/app.one/feedback')).json();assert.equal(app.items.length,3);
    assert.equal((await x.call('/v1/needs/legacy')).status,200);
    assert.equal((await x.call('/v1/needs',null,'GET','bad')).status,200);
    const filtered=await (await x.call('/v1/needs?kind=feedback')).json();assert.equal(filtered.items.length,3);
    const ops=await (await x.request('/admin/operations/projects?type=need')).json();
    assert(ops.items.some(item=>item.content_kind==='feedback'&&item.app_name==='Useful App'));
  } finally{x.close()}
});

test('app followers receive feedback notifications, ownership and both block directions apply',async()=>{
  const x=setup();try {
    assert.equal((await x.call('/v1/store-apps/app.one/follow',{},'PUT','developer')).status,200);
    const id=await x.create({kind:'feedback',storePackage:'app.one'});
    const notifications=await (await x.call('/v1/notifications',null,'GET','developer')).json();
    assert.equal(notifications.items.length,1);assert.equal(notifications.items[0].payload.targetId,id);
    const nid=notifications.items[0].id;
    assert.equal((await x.call('/v1/notifications/'+nid+'/read',{},'POST')).status,404);
    assert.equal((await x.call('/v1/notifications/'+nid+'/read',{},'POST','developer')).status,200);
    assert((await (await x.call('/v1/notifications',null,'GET','developer')).json()).items[0].read_at);
    for(const [a,b] of [['maker.skr','developer.skr'],['developer.skr','maker.skr']]) {
      x.sqlite.exec('DELETE FROM user_blocks');x.sqlite.prepare("INSERT INTO user_blocks VALUES(?,?,'2000')").run(a,b);
      await x.create({kind:'feedback',storePackage:'app.one'});
      assert.equal(x.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE recipient_skr='developer.skr'").get().n,1);
    }
    assert.equal((await (await x.call('/v1/following-apps',null,'GET','developer')).json()).items.length,1);
    await x.call('/v1/me',null,'DELETE','developer');
    assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM app_followers').get().n,0);
  }finally{x.close()}
});

test('following and testing preferences are idempotent; responses link actual apps and notify followers',async()=>{
  const x=setup();try {
    const id=await x.create({});
    for(let i=0;i<2;i++){x.clearRate();assert.equal((await x.call('/v1/needs/'+id+'/follow',{wantsTest:true},'PUT','developer')).status,200);}
    const row=await (await x.call('/v1/needs/'+id,null,'GET','developer')).json();assert.equal(row.tester_count,1);assert.equal(row.follower_count,1);assert(row.following&&row.wants_test);
    assert.equal((await (await x.call('/v1/following',null,'GET','developer')).json()).items.length,1);
    assert.equal((await x.call('/v1/needs/'+id+'/comments',{body:'Try this app',responseKind:'suggestion',linkedStorePackage:'app.one'})).status,201);
    const comments=await (await x.call('/v1/needs/'+id+'/comments')).json();assert.equal(comments.items[0].linked_app_name,'Useful App');
    assert.equal((await (await x.call('/v1/notifications',null,'GET','developer')).json()).items[0].type,'need_response');
    for(const body of [{responseKind:'official_developer'},{linkedStorePackage:'missing'},{linkedWorkId:'missing'}]) {
      x.clearRate();assert.equal((await x.call('/v1/needs/'+id+'/comments',{body:'A response',...body})).status,400);
    }
    await x.call('/v1/needs/'+id+'/follow',null,'DELETE','developer');
    assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM need_followers').get().n,0);
  }finally{x.close()}
});

test('only author can record outcomes; atomic revisions reject stale writes and concurrent duplicate events',async()=>{
  const x=setup();try {
    const id=await x.create({});
    const path='/v1/needs/'+id+'/progress';
    const body={revision:1,status:'resolved',body:'I tried the suggestion and it worked',linkedStorePackage:'app.one'};
    assert.equal((await x.call(path,body,'POST','developer')).status,403);
    assert.equal((await x.call(path,body)).status,200);
    x.clearRate();assert.equal((await x.call(path,body)).status,409);
    const detail=await (await x.call('/v1/needs/'+id)).json();assert.equal(detail.status,'resolved');assert.equal(detail.revision,2);
    const discovery=await (await x.call('/v1/discover')).json();assert.equal(discovery.resolved[0].id,id);
    x.clearRate();
    const responses=await Promise.all([x.call(path,{revision:2,status:'testing',body:'We need testers'}),x.call(path,{revision:2,status:'testing',body:'We need testers'})]);
    assert.equal(responses.filter(r=>r.status===200).length,1);
    assert.equal(x.sqlite.prepare("SELECT COUNT(*) n FROM comments WHERE target_id=?").get(id).n,2);
  }finally{x.close()}
});

test('editing is moderated, archives previous version, resets outcome, and deletion cleans history',async()=>{
  const x=setup();try {
    const id=await x.create({});
    x.sqlite.prepare("UPDATE needs SET status='resolved' WHERE id=?").run(id);
    const path='/v1/needs/'+id;
    const update={revision:1,title:'Updated question',problem:'A clearer description'};
    assert.equal((await x.call(path,update,'PUT','developer')).status,403);
    assert.equal((await x.call(path,update,'PUT')).status,200);
    let need=await (await x.call(path)).json();assert.equal(need.title,update.title);assert.equal(need.status,'open');
    assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM need_revisions').get().n,1);
    x.clearRate();x.env.AI.run=async()=>{throw new Error('offline')};
    assert.equal((await x.call(path,{...update,revision:2,problem:'New detail'},'PUT')).status,503);
    assert.equal((await (await x.call(path)).json()).revision,2);
    x.clearRate();x.env.AI.run=async()=>({response:'safe'});
    assert.equal((await x.call(path,{...update,revision:2,problem:'卖淫'},'PUT')).status,400);
    await x.call(path,null,'DELETE');
    x.sqlite.prepare("UPDATE needs SET deleted_at='2000' WHERE id=?").run(id);
    await x.cleanup();assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM need_revisions').get().n,0);
    assert.equal((await x.call(path)).status,404);
  }finally{x.close()}
});

test('referenced works obey publication, author visibility and read-time moderation',async()=>{
  const x=setup();try {
    const id=await x.create({});x.work('linked','published');
    const path='/v1/needs/'+id+'/comments';
    const body={body:'This app may help',linkedWorkId:'linked'};
    assert.equal((await x.call(path,body)).status,201);
    const comments=async()=> (await (await x.call(path)).json()).items;
    assert.equal((await comments())[0].linked_work_name,'A Seeker app');
    x.sqlite.exec("INSERT INTO user_blocks VALUES('maker.skr','developer.skr','2000')");
    assert.equal((await comments())[0].linked_work_id,null);
    x.clearRate();assert.equal((await x.call(path,body)).status,400);
    x.sqlite.exec('DELETE FROM user_blocks');
    x.sqlite.exec("UPDATE works SET description='卖淫' WHERE id='linked'");
    assert.equal((await comments())[0].linked_work_name,null);
    x.clearRate();assert.equal((await x.call(path,body)).status,400);
    x.sqlite.exec("UPDATE works SET description='For Seeker users'; UPDATE users SET status='deleted' WHERE skr_domain='developer.skr'");
    x.clearRate();assert.equal((await x.call(path,body)).status,400);
  }finally{x.close()}
});

test('a reply delivers one notification to a following parent and respects blocks',async()=>{
  const x=setup();try {
    const id=await x.create({});const path='/v1/needs/'+id+'/comments';
    const parent=await (await x.call(path,{body:'Please give more detail'},'POST','developer')).json();
    assert.equal((await x.call('/v1/needs/'+id+'/follow',{wantsTest:false},'PUT','developer')).status,200);
    x.sqlite.exec('DELETE FROM notifications');
    x.clearRate();assert.equal((await x.call(path,{body:'Here are the details',parentId:parent.id})).status,201);
    assert.equal(x.sqlite.prepare("SELECT COUNT(*) n FROM notifications WHERE recipient_skr='developer.skr'").get().n,1);
    x.sqlite.exec("DELETE FROM notifications; INSERT INTO user_blocks VALUES('developer.skr','maker.skr','2000')");
    x.clearRate();assert.equal((await x.call(path,{body:'A further update',parentId:parent.id})).status,201);
    assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM notifications').get().n,0);
    x.sqlite.exec("INSERT INTO user_blocks VALUES('maker.skr','developer.skr','2000')");
    x.clearRate();assert.equal((await x.call(path,{body:'Another update',parentId:parent.id})).status,404);
  }finally{x.close()}
});
