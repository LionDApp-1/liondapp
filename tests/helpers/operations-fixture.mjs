import { build } from 'esbuild';
import { readFileSync,readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
const compiled=await build({stdin:{contents:readFileSync('apps/api/src/index.ts','utf8')+'\nexport {runRetentionCleanup};',resolveDir:process.cwd()+'/apps/api/src',loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false});
const module={exports:{}};
new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
export function operationsFixture(databasePath=':memory:') {
  let sqlite=new DatabaseSync(databasePath);
  for(const name of readdirSync('apps/api/migrations').filter(n=>n.endsWith('.sql')).sort()) sqlite.exec(readFileSync('apps/api/migrations/'+name,'utf8'));
  for(const who of ['maker.skr','developer.skr']) sqlite.prepare("INSERT INTO users(skr_domain,wallet_address,terms_version,accepted_at,created_at,updated_at) VALUES(?,?,'v1','2000','2000','2000')").run(who,who);
  sqlite.prepare('INSERT INTO admin_sessions VALUES(?,?,?,?)').run(createHash('sha256').update('a'.repeat(64)).digest('hex'),'owner','2000','2099');
  let chain=Promise.resolve();
  const DB={prepare(sql){let args=[];return {bind(...v){args=v;return this},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){return {meta:{changes:sqlite.prepare(sql).run(...args).changes}}}}},batch(statements){
    const work=chain.then(async()=>{sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}});chain=work.catch(()=>{});return work;
  }};
  const env={DB,MEDIA:{delete:async()=>{}},AI:{run:async()=>({response:'safe'})},ENVIRONMENT:'devnet',PAYMENT_MODE:'simulation',ADMIN_PASSWORD_ORIGIN:'https://console.test',ADMIN_ORIGIN:'https://recovery.test'};
  function request(path,body,headers={}){return module.exports.default.fetch(new Request('https://console.test'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',origin:env.ADMIN_PASSWORD_ORIGIN,'x-liondapp-admin':'1',cookie:'__Host-liondapp_admin='+'a'.repeat(64),...headers},...(body?{body:JSON.stringify(body)}:{})}),env,{waitUntil(){}});}
  function need(id,date='2026-01-01T00:00:00.000Z',title='A community idea') {sqlite.prepare("INSERT INTO needs(id,author_skr,title,problem,solution_idea,audience,category,created_at) VALUES(?,'maker.skr',?,'Help builders','Better tools','Seeker users','其他',?)").run(id,title,date);}
  function work(id,status='pending',date='2026-01-01T00:00:00.000Z',title='A Seeker app'){sqlite.prepare("INSERT INTO works(id,author_skr,name,summary,description,store_url,category,icon_key,created_at,moderation_status) VALUES(?,'developer.skr',?,'A useful app','For Seeker users','https://example.test','其他','icon.webp',?,?)").run(id,title,date,status);}
  function publicRequest(path,body,method='GET',token='') { return module.exports.default.fetch(new Request('https://community.test'+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),env,{waitUntil(){}}); }
  return {get sqlite(){return sqlite},env,request,publicRequest,need,work,reopen(){sqlite.close();sqlite=new DatabaseSync(databasePath)},cleanup:()=>module.exports.runRetentionCleanup(env),close(){sqlite.close()}};
}
