import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync,readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
const built=await build({entryPoints:['apps/api/src/store-catalog.ts'],bundle:true,platform:'node',format:'cjs',write:false});
const m={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
const {translationChunks,translateStoreCatalogBatch}=m.exports;
function setup(){const sqlite=new DatabaseSync(':memory:');for(const name of readdirSync('apps/api/migrations').filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync('apps/api/migrations/'+name,'utf8'));const calls=[];const DB={prepare(sql){let args=[];return{bind(...a){args=a;return this},async first(){return sqlite.prepare(sql).get(...args)??null},async all(){return{results:sqlite.prepare(sql).all(...args)}},async run(){return{meta:{changes:sqlite.prepare(sql).run(...args).changes}}}}}};return {sqlite,calls,env:{DB,AI:{run:async(model,p)=>{const text=JSON.parse(p.messages[1].content).text;calls.push(text);return{choices:[{finish_reason:'stop',message:{content:JSON.stringify({translation:'译文 '+text})}}]}}}}};}
function add(x,id,description){x.sqlite.prepare("INSERT INTO store_catalog(android_package,display_name,subtitle,description,category_name,store_url,synced_at) VALUES(?,?,'Subtitle',?,'Games','solanadappstore://details?id=x','2026')").run(id,id,description);}
test('long descriptions are fully chunked and translated without truncation',async()=>{const x=setup();const text='Long description. '.repeat(600)+'END_MARKER';assert.equal(translationChunks(text).join(''),text);add(x,'app',text);const r=await translateStoreCatalogBatch(x.env);assert.equal(r.translated,1);assert.ok(x.calls.every(s=>s.length<=900));assert.match(x.sqlite.prepare('SELECT description_zh FROM store_catalog').get().description_zh,/END_MARKER/);});
test('failed item is deferred without blocking other items, and existing lock prevents duplicate batches',async()=>{const x=setup();add(x,'a','FAIL');add(x,'b','Works');x.env.AI.run=async(_,p)=>{const text=JSON.parse(p.messages[1].content).text;if(text==='FAIL')throw Error('offline');return{response:JSON.stringify({translation:text})}};const r=await translateStoreCatalogBatch(x.env);assert.equal(r.failed,1);assert.equal(r.translated,1);assert.equal(r.remaining,1);assert.equal(x.sqlite.prepare("SELECT translation_attempts FROM store_catalog WHERE android_package='a'").get().translation_attempts,1);x.sqlite.exec("INSERT INTO catalog_translation_lock VALUES(1,'other','2099')");assert.equal((await translateStoreCatalogBatch(x.env)).locked,true);});
test('source changes during AI request cannot save stale translation',async()=>{const x=setup();add(x,'a','Original');x.env.AI.run=async(_,p)=>{x.sqlite.exec("UPDATE store_catalog SET description='Changed'");return{response:JSON.stringify({translation:JSON.parse(p.messages[1].content).text})}};const r=await translateStoreCatalogBatch(x.env);assert.equal(r.translated,0);assert.equal(x.sqlite.prepare('SELECT translated_at FROM store_catalog').get().translated_at,null);});

test('truncated or malformed model responses never become published translations',async()=>{
 const x=setup();add(x,'a','Original');
 x.env.AI.run=async()=>({choices:[{finish_reason:'length',message:{content:'{"translation":"incomplete"}'}}]});
 assert.equal((await translateStoreCatalogBatch(x.env)).failed,1);
 assert.equal(x.sqlite.prepare('SELECT translated_at FROM store_catalog').get().translated_at,null);
 x.sqlite.exec('UPDATE store_catalog SET translation_retry_at=NULL');
 x.env.AI.run=async()=>({response:'not valid JSON'});
 assert.equal((await translateStoreCatalogBatch(x.env)).failed,1);
 assert.equal(x.sqlite.prepare('SELECT description_zh FROM store_catalog').get().description_zh,null);
});

test('daily cap stops before provider calls, preserves attempts, and next UTC day resumes cached segments',async(t)=>{
 const now=Date.UTC(2026,8,27,23,59);let clock=now;t.mock.method(Date,'now',()=>clock);
 const x=setup();add(x,'a','Description');
 x.sqlite.exec("INSERT INTO catalog_translation_daily(day,calls) VALUES('2026-09-27',29)");
 const first=await translateStoreCatalogBatch(x.env);
 assert.equal(first.paused,'daily_budget');assert.equal(first.failed,0);assert.equal(x.calls.length,1);
 assert.equal(x.sqlite.prepare('SELECT translation_attempts FROM store_catalog').get().translation_attempts,0);
 assert.equal((await translateStoreCatalogBatch(x.env)).paused,'daily_budget');assert.equal(x.calls.length,1);
 clock=now+120_000;
 assert.equal((await translateStoreCatalogBatch(x.env)).translated,1);
 assert.deepEqual(x.calls,['Subtitle','Description'],'successful subtitle is reused across reset');
});
test('provider quota pauses the day without consuming per-app failure retries',async()=>{
 const x=setup();add(x,'a','Description');let requests=0;
 x.env.AI.run=async()=>{requests++;throw Error('daily neuron quota exceeded')};
 assert.equal((await translateStoreCatalogBatch(x.env)).paused,'provider_quota');
 assert.equal((await translateStoreCatalogBatch(x.env)).paused,'daily_budget');
 assert.equal(requests,1);assert.equal(x.sqlite.prepare('SELECT translation_attempts FROM store_catalog').get().translation_attempts,0);
});
test('budget reservation cannot exceed 30 across concurrent request reservations',async()=>{
 const x=setup();const b=await build({entryPoints:['apps/api/src/translation-budget.ts'],bundle:true,platform:'node',format:'cjs',write:false});
 const mod={exports:{}};new Function('require','module','exports',b.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
 const result=await Promise.allSettled(Array.from({length:45},()=>mod.exports.reserveTranslationCall(x.env)));
 assert.equal(result.filter(r=>r.status==='fulfilled').length,30);
 assert.equal(x.sqlite.prepare('SELECT calls FROM catalog_translation_daily').get().calls,30);
});
