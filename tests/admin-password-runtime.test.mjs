import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const built = await build({entryPoints:['apps/api/src/admin-password.ts'],bundle:true,platform:'node',format:'cjs',write:false});
const m={exports:{}}; new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
const {adminAuthRoute,passwordSession}=m.exports;
function setup(){
 const sqlite=new DatabaseSync(':memory:');
 for(const name of readdirSync('apps/api/migrations').filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync('apps/api/migrations/'+name,'utf8'));
 const DB={prepare(sql){let args=[];return {bind(...a){args=a;return this},async first(){return sqlite.prepare(sql).get(...args)??null},async run(){return {meta:{changes:sqlite.prepare(sql).run(...args).changes}}}}},async batch(q){sqlite.exec('BEGIN');try{const r=[];for(const s of q)r.push(await s.run());sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}};
 const env={DB,ABUSE_HASH_KEY:'synthetic-test-pepper-at-least-32-characters',ADMIN_ORIGIN:'https://admin.example.test',ADMIN_PASSWORD_ORIGIN:'https://console.example.test'};
 const access=async r=>{if(r.headers.get('cf-access-jwt-assertion')!=='test-owner')throw new Error('not owner');return 'owner@example.test'};
 function req(path,body,headers={}) {return new Request('https://api.example.test/admin/auth/'+path,{method:body?'POST':'GET',headers:{origin:env.ADMIN_PASSWORD_ORIGIN,'x-liondapp-admin':'1','content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})})}
 return {sqlite,env,req,call:(path,body,headers)=>adminAuthRoute('/admin/auth/'+path,req(path,body,headers),env,access)};
}
const credentials={username:'owner',password:'synthetic-password-only-123'};
test('only verified owner can enroll, password is not stored, cookie login and logout are enforced',async()=>{
 const x=setup(); await assert.rejects(x.call('setup',credentials));
 await x.call('setup',credentials,{'cf-access-jwt-assertion':'test-owner'});
 const row=x.sqlite.prepare('SELECT * FROM admin_credentials').get();assert.notEqual(row.password_hash,credentials.password);assert.equal(row.password_hash.length,64);
 await assert.rejects(x.call('login',{...credentials,password:'wrong'}),e=>e.code==='admin_login_failed');
 const response=await x.call('login',{...credentials,remember:true});const cookie=response.headers.get('set-cookie');
 for(const flag of ['Secure','HttpOnly','SameSite=Strict','Max-Age=2592000'])assert.ok(cookie.includes(flag));
 assert.equal(await passwordSession(x.req('status',null,{cookie}),x.env),'password:owner');
 await assert.rejects(passwordSession(x.req('logout',{}, {cookie,origin:'https://evil.test'}),x.env),e=>e.code==='admin_origin_required');
 await x.call('logout',{}, {cookie});assert.equal(await passwordSession(x.req('status',null,{cookie}),x.env),null);
});
test('password reset revokes existing sessions and expired sessions cannot authorize',async()=>{
 const x=setup();await x.call('setup',credentials,{'cf-access-jwt-assertion':'test-owner'});
 const a=await x.call('login',credentials);const cookie=a.headers.get('set-cookie');
 await x.call('setup',{...credentials,password:'new-synthetic-password-123'}, {'cf-access-jwt-assertion':'test-owner'});
 assert.equal(await passwordSession(x.req('status',null,{cookie}),x.env),null);
 await assert.rejects(x.call('login',credentials),e=>e.code==='admin_login_failed');
 const b=await x.call('login',{...credentials,password:'new-synthetic-password-123'});
 x.sqlite.exec("UPDATE admin_sessions SET expires_at='2000'");
 assert.equal(await passwordSession(x.req('status',null,{cookie:b.headers.get('set-cookie')}),x.env),null);
});
test('cross-origin login is rejected, login throttle persists across seconds and expires after 15 minutes',async(t)=>{
 const start=Date.UTC(2026,8,17,8,0,0); let clock=start;
 t.mock.method(Date,'now',()=>clock);
 const x=setup();await assert.rejects(x.call('login',credentials,{origin:'https://evil.test'}),e=>e.code==='admin_origin_required');
 for(let n=0;n<15;n++) {clock=start+n*1000; await assert.rejects(x.call('login',credentials),e=>e.code==='admin_login_failed');}
 clock=start+899_000;
 await assert.rejects(x.call('login',credentials),e=>e.code==='admin_login_rate_limited');
 assert.equal(x.sqlite.prepare("SELECT window_started_at FROM rate_limits WHERE identity_skr='admin-global'").get().window_started_at,start/1000);
 clock=start+900_000;
 await assert.rejects(x.call('login',credentials),e=>e.code==='admin_login_failed');
});
