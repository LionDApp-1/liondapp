import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

const bundled = await build({
  stdin: { contents: readFileSync('apps/api/src/index.ts', 'utf8') + '\nexport { runRetentionCleanup, adminRoute };', resolveDir: process.cwd() + '/apps/api/src', loader: 'ts' },
  bundle: true, platform: 'node', format: 'cjs', write: false,
});
const module = { exports: {} };
new Function('require', 'module', 'exports', bundled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { default: worker, runRetentionCleanup } = module.exports;

function setup(aiResponse = 'safe', databasePath = ':memory:') {
  let sqlite = new DatabaseSync(databasePath);
  for (const name of readdirSync('apps/api/migrations').filter(n => n.endsWith('.sql')).sort()) sqlite.exec(readFileSync(`apps/api/migrations/${name}`, 'utf8'));
  const identity = 'maker.skr';
  sqlite.exec(`INSERT INTO users(skr_domain,wallet_address,terms_version,accepted_at,created_at,updated_at) VALUES('maker.skr','wallet','v1','2000-01-01','2000-01-01','2000-01-01');
    INSERT INTO auth_challenges VALUES('challenge','wallet','nonce','message','2000-01-01','2099-01-01',NULL);
    INSERT INTO needs(id,author_skr,title,problem,solution_idea,audience,category,created_at) VALUES('need','maker.skr','Safe need','Safe problem','Safe solution','Everyone','其他','2000-01-01');`);
  sqlite.prepare('INSERT INTO sessions(token_hash,challenge_id,skr_domain,wallet_address,created_at,expires_at) VALUES(?,?,?,?,?,?)').run(createHash('sha256').update('test-session').digest('hex'), 'challenge', identity, 'wallet', '2000-01-01', '2099-01-01');
  const DB = {
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return sqlite.prepare(sql).get(...args) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...args), success: true }; },
        async run() { const r = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; },
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const result = []; for (const s of statements) result.push(await s.run()); sqlite.exec('COMMIT'); return result; }
      catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
  };
  let aiCalls = 0;
  const deletedMedia = [];
  const env = { DB, MEDIA: { head: async () => ({}), delete: async key => deletedMedia.push(key) },
    AI: { run: async () => { aiCalls++; if (aiResponse instanceof Error) throw aiResponse; return { response: aiResponse }; } },
    ENVIRONMENT: 'devnet', PAYMENT_MODE: 'simulation', APP_ORIGIN: 'https://example.test' };
  const request = (path, body, method = body ? 'POST' : 'GET', token = 'test-session') => worker.fetch(new Request(`https://example.test${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, { waitUntil() {} });
  for (const who of ['dev', 'outsider']) {
    sqlite.prepare("INSERT INTO users(skr_domain,wallet_address,terms_version,accepted_at,created_at,updated_at) VALUES(?,?,'v1','2000','2000','2000')").run(who + '.skr', who);
    sqlite.prepare("INSERT INTO auth_challenges VALUES(?,?,?,'message','2000','2099',NULL)").run(who, who, who);
    sqlite.prepare("INSERT INTO sessions(token_hash,challenge_id,skr_domain,wallet_address,created_at,expires_at) VALUES(?,?,?,?,'2000','2099')").run(createHash('sha256').update(who).digest('hex'), who, who + '.skr', who);
  }
  return { get sqlite() { return sqlite; }, env, request, deletedMedia, aiCalls: () => aiCalls,
    reopen() { assert.notEqual(databasePath, ':memory:'); sqlite.close(); sqlite = new DatabaseSync(databasePath); } };
}


const need = { title: 'Build tool', problem: 'A wallet problem', solutionIdea: 'A tool', audience: 'Developers', category: '其他', tags: [] };
async function start(x) { const r = await x.request('/v1/conversations', { needId: 'need' }, 'POST', 'dev'); assert.equal(r.status, 201); return (await r.json()).id; }
const client = n => '00000000-0000-0000-0000-' + String(n).padStart(12, '0');
async function send(x, id, n, text = 'Let us discuss the scope', token = 'dev') { return x.request(`/v1/conversations/${id}/messages`, { body: text, clientId: client(n) }, 'POST', token); }

test('two isolated identities retain replies, read positions and withdrawals after database restart and cleanup', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'liondapp-chat-'));
  const x = setup('safe', join(directory, 'community.sqlite'));
  try {
    const id = await start(x);
    const question = await (await send(x, id, 1, 'Can you clarify the scope?')).json();
    const reply = await (await send(x, id, 2, 'Start with an accessible mobile prototype.', 'test-session')).json();
    const list = async token => (await (await x.request('/v1/conversations', null, 'GET', token)).json()).items;
    const history = async token => (await (await x.request(`/v1/conversations/${id}/messages`, null, 'GET', token)).json()).items;
    assert.equal((await list('dev'))[0].unread_count, 1);
    assert.equal((await list('test-session'))[0].unread_count, 1);
    const initial = await history('dev');
    assert.deepEqual(initial.map(m => m.id), [question.id, reply.id]);
    await x.request(`/v1/conversations/${id}/read`, { lastSeq: initial.at(-1).seq }, 'POST', 'dev');

    // Old timestamps must not cause automatic deletion of messages or their project.
    x.sqlite.exec("UPDATE messages SET created_at='2000-01-01T00:00:00Z'");
    await runRetentionCleanup(x.env);
    x.reopen();
    assert.deepEqual((await history('dev')).map(m => m.body), initial.map(m => m.body));
    assert.deepEqual(await history('dev'), await history('test-session'));
    assert.equal((await list('dev'))[0].unread_count, 0);
    assert.equal((await list('test-session'))[0].unread_count, 1);
    const retry = await (await send(x, id, 1, 'Can you clarify the scope?')).json();
    assert.equal(retry.id, question.id);
    assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM messages').get().n, 2);

    assert.equal((await x.request(`/v1/conversations/${id}/messages/${question.id}`, null, 'DELETE', 'dev')).status, 204);
    x.reopen();
    for (const token of ['dev', 'test-session']) {
      const items = await history(token);
      assert.equal(items[0].body, '');
      assert.ok(items[0].deleted_at);
      assert.equal(items[1].body, initial[1].body);
    }
    assert.equal((await list('test-session'))[0].unread_count, 0);
    assert.equal((await x.request(`/v1/conversations/${id}/messages`, null, 'GET', 'outsider')).status, 404);
    assert.equal(x.sqlite.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally { x.sqlite.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('free and paid budgets validate strictly and paid needs lead every feed sort and search', async () => {
  const x = setup();
  for (const [type, budget, status] of [['free', null, 201], ['paid_development', 100, 201], ['paid_development', 0, 400], ['paid_development', 1.5, 400], ['paid_development', '100', 400], ['invalid', 100, 400]]) {
    x.sqlite.exec('DELETE FROM rate_limits');
    assert.equal((await x.request('/v1/needs', { ...need, requestType: type, budgetSkr: budget })).status, status);
  }
  x.sqlite.exec("DELETE FROM rate_limits; UPDATE needs SET need_count=999 WHERE request_type='free'");
  assert.equal((await x.request('/v1/needs', { ...need, requestType: 'paid_development', budgetSkr: 200 })).status, 201);
  for (const path of ['/v1/needs?sort=latest', '/v1/needs?sort=needed', '/v1/needs?sort=discussed', '/v1/search?q=Build']) {
    const data = await (await x.request(path)).json(); const items = data.items ?? data.needs;
    assert.deepEqual(items.slice(0,2).map(x => x.budget_skr), [200,100]);
    assert(items.slice(2).every(x => x.request_type === 'free'));
  }
  x.sqlite.close();
});

test('conversation creation is idempotent, requires login, a visible need, and another active user', async () => {
  const x = setup(); const id = await start(x);
  assert.equal((await (await x.request('/v1/conversations', { needId: 'need' }, 'POST', 'dev')).json()).id, id);
  assert.equal((await x.request('/v1/conversations', { needId: 'need' })).status, 400);
  assert.equal((await x.request('/v1/conversations', { needId: 'missing' }, 'POST', 'dev')).status, 404);
  assert.equal((await x.request('/v1/conversations', null, 'GET', 'bad')).status, 401);
  x.sqlite.close();
});

test('outsiders cannot read, send, mark read, delete, or report private messages', async () => {
  const x = setup(); const id = await start(x); const message = await (await send(x,id,1)).json();
  for (const [path,body,method] of [
    [`/v1/conversations/${id}/messages`, null, 'GET'],
    [`/v1/conversations/${id}/messages`, { body:'hello',clientId:client(2) }, 'POST'],
    [`/v1/conversations/${id}/read`, {lastSeq:1}, 'POST'],
    [`/v1/conversations/${id}/messages/${message.id}`, null, 'DELETE'],
    [`/v1/conversations/${id}/messages/${message.id}/report`, {reason:'spam'}, 'POST'],
  ]) assert.equal((await x.request(path,body,method,'outsider')).status,404);
  assert.equal((await (await x.request('/v1/conversations',null,'GET','outsider')).json()).items.length,0);
  assert.equal((await x.request('/admin/message-reports')).status,401);
  x.sqlite.close();
});

test('retry IDs deduplicate successful sends and cannot be reused with changed content', async () => {
  const x=setup();const id=await start(x);
  const first=await (await send(x,id,1)).json();const again=await (await send(x,id,1)).json();
  assert.equal(first.id,again.id);assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM messages').get().n,1);
  assert.equal((await send(x,id,1,'Changed content')).status,409);
  x.sqlite.close();
});

test('both directions of blocking prevent new messages while preserving reporting access', async () => {
  for(const [a,b] of [['maker.skr','dev.skr'],['dev.skr','maker.skr']]) {
    const x=setup();const id=await start(x);await send(x,id,1);
    x.sqlite.prepare("INSERT INTO user_blocks VALUES(?,?,'2000')").run(a,b);
    assert.equal((await send(x,id,2)).status,403);
    assert.equal((await send(x,id,3,'Hello','test-session')).status,403);
    assert.equal((await x.request(`/v1/conversations/${id}/messages`)).status,200);
    x.sqlite.close();
  }
});

test('unsafe content and failed moderation never enter private messages; rejection audit is recorded', async () => {
  for(const [response,body,status] of [['safe','卖淫',400],['unsafe\nS1','unsafe semantics',400],[new Error('offline'),'A valid inquiry',503]]) {
    const x=setup(response);const id=await start(x);
    assert.equal((await send(x,id,1,body)).status,status);
    assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM messages').get().n,0);
    if(status===400) assert.equal(x.sqlite.prepare("SELECT surface FROM moderation_events").get().surface,'message');
    x.sqlite.close();
  }
});

test('pagination, exact read cursor and unread count do not mark newer messages read', async () => {
  const x=setup();const id=await start(x);
  for(let i=1;i<=55;i++) x.sqlite.prepare("INSERT INTO messages(id,conversation_id,sender_skr,client_id,body,created_at) VALUES(?,?,'dev.skr',?,'hello','2000')").run('m'+i,id,client(i));
  const page=await (await x.request(`/v1/conversations/${id}/messages`)).json();
  assert.equal(page.items.length,50);assert.equal(page.items[0].seq,6);assert.equal(page.nextCursor,6);
  const older=await (await x.request(`/v1/conversations/${id}/messages?before=6`)).json();assert.equal(older.items.length,5);
  await x.request(`/v1/conversations/${id}/read`,{lastSeq:50});
  await x.request(`/v1/conversations/${id}/read`,{lastSeq:20});
  const list=await (await x.request('/v1/conversations')).json();assert.equal(list.items[0].unread_count,5);
  assert.equal((await x.request(`/v1/conversations/${id}/read`,{lastSeq:1000})).status,400);
  assert.equal((await x.request(`/v1/conversations/${id}/messages?before=-1`)).status,400);
  x.sqlite.close();
});

test('only authors may withdraw; reports preserve evidence; account deletion removes outgoing text', async () => {
  const x=setup();const id=await start(x);const m=await (await send(x,id,1)).json();
  const path=`/v1/conversations/${id}/messages/${m.id}`;
  assert.equal((await x.request(path,null,'DELETE')).status,403);
  assert.equal((await x.request(path+'/report',{reason:'Please review'})).status,201);
  assert.equal((await x.request(path,null,'DELETE','dev')).status,204);
  const items=(await (await x.request(`/v1/conversations/${id}/messages`)).json()).items;
  assert.equal(items[0].body,'');assert(items[0].deleted_at);
  x.sqlite.exec("UPDATE messages SET deleted_at='2000-01-01'"); await runRetentionCleanup(x.env);
  assert.notEqual(x.sqlite.prepare('SELECT body FROM messages').get().body,'');
  x.sqlite.exec("UPDATE message_reports SET status='dismissed',resolved_at='2000-01-01'"); await runRetentionCleanup(x.env);
  assert.equal(x.sqlite.prepare('SELECT body FROM messages').get().body,'');
  await send(x,id,2);await x.request('/v1/me',null,'DELETE','dev');
  assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM messages WHERE deleted_at IS NULL').get().n,0);
  assert.equal((await send(x,id,3,'After deletion','test-session')).status,403);
  x.sqlite.close();
});

test('administrator can review reported messages and remove them with an audit record', async () => {
  const { generateKeyPair, exportJWK, SignJWT } = await import('jose');
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = await exportJWK(publicKey);
  const x = setup(); const id = await start(x); const message = await (await send(x,id,1)).json();
  await x.request(`/v1/conversations/${id}/messages/${message.id}/report`,{reason:'Review this message'});
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.equal(String(url),'https://chat-review.example/cdn-cgi/access/certs');
    return Response.json({ keys: [{ ...jwk, kid:'test',alg:'ES256',use:'sig' }] });
  };
  try {
    Object.assign(x.env,{CF_ACCESS_TEAM_DOMAIN:'chat-review.example',CF_ACCESS_AUD:'test',ADMIN_EMAIL:'moderator@example.test'});
    const token=await new SignJWT({email:'moderator@example.test'}).setProtectedHeader({alg:'ES256',kid:'test'}).setIssuer('https://chat-review.example').setAudience('test').setExpirationTime('5m').sign(privateKey);
    const call=(path,body)=>worker.fetch(new Request('https://example.test'+path,{method:body?'POST':'GET',headers:{'cf-access-jwt-assertion':token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),x.env,{});
    const list=await (await call('/admin/message-reports')).json();assert.equal(list.items.length,1);assert.equal(list.items[0].body,'Let us discuss the scope');
    assert.equal((await call('/admin/message-reports/'+list.items[0].id,{decision:'removed'})).status,200);
    assert.equal(x.sqlite.prepare('SELECT status FROM message_reports').get().status,'removed');
    assert.equal(x.sqlite.prepare('SELECT action FROM audit_log').get().action,'message_review');
    assert.equal((await (await x.request(`/v1/conversations/${id}/messages`)).json()).items[0].body,'');
  } finally {globalThis.fetch=originalFetch;x.sqlite.close();}
});
