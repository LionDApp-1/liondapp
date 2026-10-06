import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { operationsFixture } from './helpers/operations-fixture.mjs';
const base='/admin/operations';
const update={revision:0,stage:'in_progress',assignee:'owner',due_at:'2025-01-01T00:00:00.000Z',note:'Follow up with submitter'};

test('operations endpoints require an admin session; writes enforce CSRF origin and header',async()=>{
 const x=operationsFixture();try{x.need('n');
 for(const path of ['/summary','/projects','/projects/need/n'])assert.equal((await x.request(base+path,null,{cookie:''})).status,401);
 assert.equal((await x.request(base+'/projects/need/n',update,{origin:'https://evil.test'})).status,403);
 assert.equal((await x.request(base+'/projects/need/n',update,{'x-liondapp-admin':''})).status,403);
 assert.equal(x.sqlite.prepare('SELECT COUNT(*) AS n FROM operations_projects').get().n,0);
 }finally{x.close()}
});
test('dashboard counts every record, includes message reports and sorts oldest work beyond 200-row lists',async()=>{
 const x=operationsFixture();try{
 for(let i=0;i<230;i++)x.need('n'+i,'2026-01-02T00:00:00.000Z');
 x.need('oldest','2026-01-01T00:00:00.000Z');x.work('pending');x.work('released','published');x.work('rejected','rejected');x.need('deleted');x.sqlite.exec("UPDATE needs SET deleted_at='2026-01-03' WHERE id='deleted'");
 x.sqlite.exec("INSERT INTO reports(id,reporter_skr,target_type,target_id,reason,created_at) VALUES('r','maker.skr','need','oldest','Spam','2026-01-02')");
 x.sqlite.exec("INSERT INTO conversations VALUES('c','oldest','maker.skr','developer.skr','2000','2000'); INSERT INTO messages(id,conversation_id,sender_skr,client_id,body,created_at) VALUES('m','c','developer.skr','client','Test','2000');INSERT INTO message_reports(id,message_id,reporter_skr,reason,created_at) VALUES('mr','m','maker.skr','Abuse','2026-01-01')");
 const data=await (await x.request(base+'/summary')).json();
 assert.equal(data.totals.total,234);assert.equal(data.totals.backlog,232);assert.equal(data.totals.unassigned,232);assert.equal(data.totals.oldest_since,'2026-01-01T00:00:00.000Z');assert.equal(data.reports.total,2);assert.equal(data.reports.items[0].kind,'message_report');
 assert.equal(data.projects.length,6);assert.equal(data.stages.reduce((sum,s)=>sum+s.count,0),234);
 assert.equal((await (await x.request(base+'/projects?stage=new&page=10')).json()).items.length,7);
 }finally{x.close()}
});
test('assignment, due date and notes survive reopening; concurrent edits cannot overwrite or create duplicate audit',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'lion-ops-'));const x=operationsFixture(join(folder,'db.sqlite'));
 try{x.need('n');const responses=await Promise.all([x.request(base+'/projects/need/n',update),x.request(base+'/projects/need/n',{...update,assignee:'other'})]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(x.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n,1);
 x.reopen();const saved=await (await x.request(base+'/projects/need/n')).json();assert.equal(saved.revision,1);assert.equal(saved.note,update.note);assert.ok(['owner','other'].includes(saved.assignee));
 const summary=await (await x.request(base+'/summary')).json();assert.equal(summary.totals.overdue,1);assert.equal(summary.totals.unassigned,0);
 const body={...update,revision:1,stage:'done'};assert.equal((await x.request(base+'/projects/need/n',body)).status,200);
 assert.equal((await (await x.request(base+'/summary')).json()).totals.overdue,0);
 const audit=JSON.stringify(x.sqlite.prepare('SELECT * FROM audit_log').all());assert.ok(!audit.includes(update.note));
 }finally{x.close();rmSync(folder,{recursive:true,force:true})}
});
test('pending work cannot close before review; review automatically closes follow-up and source deletion hides it',async()=>{
 const x=operationsFixture();try{x.work('w');
 assert.equal((await x.request(base+'/projects/work/w',{...update,stage:'done'})).status,409);
 assert.equal((await x.request(base+'/projects/work/w',update)).status,200);
 x.sqlite.exec("UPDATE works SET moderation_status='published',reviewed_at='2026-09-28T12:00:00Z' WHERE id='w'");
 const item=await (await x.request(base+'/projects/work/w')).json();assert.equal(item.stage,'done');assert.equal(item.revision,2);assert.equal(item.assignee,'owner');
 x.sqlite.exec("UPDATE works SET deleted_at='2026-09-28' WHERE id='w'");assert.equal((await x.request(base+'/projects/work/w')).status,404);assert.equal((await (await x.request(base+'/summary')).json()).totals.total,0);
 }finally{x.close()}
});
test('filters use bound literal search, distinguish type, reject bad revisions and produce accurate trend dates',async()=>{
 const x=operationsFixture();try{const today=new Date().toISOString();x.need('same',today,'100% builders');x.work('same');
 assert.equal((await x.request(base+'/projects/need/same',update)).status,200);
 assert.equal((await (await x.request(base+'/projects?owner=mine&overdue=true')).json()).total,1);
 assert.equal((await (await x.request(base+'/projects?type=work')).json()).items[0].revision,0);
 assert.equal((await (await x.request(base+'/projects?q=%25')).json()).total,1);
 assert.equal((await (await x.request(base+'/projects?q='+encodeURIComponent("' OR 1=1 --"))).json()).total,0);
 for(const body of [{...update,stage:'shipped'},{...update,revision:-1},{...update,assignee:'x'.repeat(81)},{...update,due_at:'no-date'}])assert.equal((await x.request(base+'/projects/work/same',body)).status,400);
 assert.equal((await x.request(base+'/projects?page=-1')).status,400);
 const data=await (await x.request(base+'/summary')).json();assert.equal(data.totals.new_today,1);assert.equal(data.trend[0].day,today.slice(0,10));
 }finally{x.close()}
});

test('retention removes follow-up notes only after source deletion, leaving long-lived active projects intact',async()=>{
 const x=operationsFixture();try{x.need('live');x.need('old');x.need('recent');
 for(const id of ['live','old','recent'])await x.request(base+'/projects/need/'+id,update);
 x.sqlite.exec("UPDATE needs SET deleted_at='2000-01-01' WHERE id='old'");
 x.sqlite.prepare("UPDATE needs SET deleted_at=? WHERE id='recent'").run(new Date().toISOString());
 await x.cleanup();assert.deepEqual(x.sqlite.prepare('SELECT target_id FROM operations_projects ORDER BY target_id').all().map(x=>x.target_id),['live','recent']);
 assert.equal((await (await x.request(base+'/summary')).json()).totals.total,1);
 }finally{x.close()}
});

test('project status includes read-time moderation without leaking raw policy fields',async()=>{
 const x=operationsFixture();try{x.work('hidden','published');x.sqlite.exec("UPDATE works SET description='verify your seed phrase' WHERE id='hidden'");
 const item=await (await x.request(base+'/projects/work/hidden')).json();assert.equal(item.policy_violation,true);assert.equal(item.policy_fields,undefined);
 const list=await (await x.request(base+'/projects?stage=all')).json();assert.equal(list.items[0].policy_violation,true);assert.equal(list.items[0].policy_fields,undefined);
 }finally{x.close()}
});
