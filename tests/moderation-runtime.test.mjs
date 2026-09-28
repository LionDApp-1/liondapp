import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync, readdirSync } from 'node:fs';
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

function setup(aiResponse = 'safe') {
  const sqlite = new DatabaseSync(':memory:');
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
  const request = (path, body, method = body ? 'POST' : 'GET') => worker.fetch(new Request(`https://example.test${path}`, { method, headers: { authorization: 'Bearer test-session', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, { waitUntil() {} });
  return { sqlite, env, request, deletedMedia, aiCalls: () => aiCalls };
}

const workPayload = description => ({ name: 'qqq', summary: 'Test app', description, category: '其他', iconKey: 'uploads/maker.skr/11111111.webp', screenshotKeys: ['uploads/maker.skr/22222222.webp', 'uploads/maker.skr/33333333.webp'] });

test('reported terms and obfuscated variants cannot create works or comments', async () => {
  for (const word of ['习近平', '共 产 党', '共\u200b產\u200b黨', '卖淫', '嫖·娼', '賣淫', '港獨', 'xi jinping']) {
    for (const path of ['/v1/works', '/v1/needs/need/comments']) {
      const x = setup();
      const r = await x.request(path, path === '/v1/works' ? workPayload(word) : { body: word });
      assert.equal(r.status, 400, `${path}: ${word}`);
      assert.equal((await r.json()).error, 'content_not_allowed');
      assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM works').get().n, 0);
      assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM comments').get().n, 0);
      assert.equal(x.aiCalls(), 0, 'clear rule matches must not incur AI cost');
      assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM moderation_events').get().n, 1);
      x.sqlite.close();
    }
  }
});

test('semantic unsafe, provider error, and malformed responses never publish comments', async () => {
  for (const [answer, status, code] of [['unsafe\nS1', 400, 'content_not_allowed'], [new Error('unavailable'), 503, 'moderation_unavailable'], ['maybe safe', 503, 'moderation_unavailable'], ['', 503, 'moderation_unavailable']]) {
    const x = setup(answer);
    const r = await x.request('/v1/needs/need/comments', { body: 'A sentence to classify in context' });
    assert.equal(r.status, status);
    assert.equal((await r.json()).error, code);
    assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM comments').get().n, 0);
    x.sqlite.close();
  }
});

test('normal criticism is published and safe work still awaits manual review', async () => {
  const x = setup();
  assert.equal((await x.request('/v1/needs/need/comments', { body: '这个界面不好用，香港和台湾用户也需要更好的钱包体验' })).status, 201);
  const result = await x.request('/v1/works', workPayload('A wallet export tool'));
  assert.equal(result.status, 201);
  assert.equal((await result.json()).status, 'pending');
  assert.equal(x.sqlite.prepare('SELECT moderation_status FROM works').get().moderation_status, 'pending');
  x.sqlite.close();
});

test('legacy banned content disappears from public feeds, search, profiles and detail without deletion', async () => {
  const x = setup();
  x.sqlite.exec(`INSERT INTO works(id,author_skr,name,summary,description,store_url,category,icon_key,moderation_status,created_at) VALUES('qqq','maker.skr','qqq','Test','卖淫 习近平','','其他','icon','published','2000-01-01');
    INSERT INTO comments(id,author_skr,target_type,target_id,body,created_at) VALUES('bad','maker.skr','need','need','嫖娼','2000-01-01');
    INSERT INTO comments(id,author_skr,target_type,target_id,parent_id,body,created_at) VALUES('reply','maker.skr','need','need','bad','Safe reply','2000-01-01');
    INSERT INTO comments(id,author_skr,target_type,target_id,body,created_at) VALUES('good','maker.skr','need','need','Thanks','2000-01-01');`);
  assert.equal((await (await x.request('/v1/works')).json()).items.length, 0);
  assert.equal((await (await x.request('/v1/search?q=qqq')).json()).works.length, 0);
  assert.equal((await (await x.request('/v1/profiles/maker.skr')).json()).works.length, 0);
  assert.equal((await x.request('/v1/works/qqq')).status, 404);
  assert.equal((await x.request('/v1/works/qqq/comments')).status, 404);
  assert.deepEqual((await (await x.request('/v1/needs/need/comments')).json()).items.map(x => x.id), ['good']);
  assert.equal(x.sqlite.prepare('SELECT deleted_at FROM works WHERE id=?').get('qqq').deleted_at, null);
  assert.equal(x.sqlite.prepare('SELECT body FROM comments WHERE id=?').get('bad').body, '嫖娼');
  const owned = (await (await x.request('/v1/me')).json()).works;
  assert.equal(owned.length, 1, 'owner retains their record');
  assert.equal(owned[0].moderation_status, 'published', 'original review decision is retained');
  assert.equal(owned[0].public_visibility, 'hidden_policy', 'owner sees effective public visibility');
  x.sqlite.close();
});

test('retention keeps decades-old active content and media, only cleans previously deleted content', async () => {
  const x = setup();
  for (const [id, deletedAt] of [['active', null], ['removed', '2000-01-01']]) {
    x.sqlite.prepare(`INSERT INTO works(id,author_skr,name,summary,description,store_url,category,icon_key,screenshots_json,moderation_status,created_at,deleted_at) VALUES(?,'maker.skr',?,'Summary','Keep me','','其他',?,?,'published','2000-01-01',?)`).run(id, id, id + '.webp', JSON.stringify([id + '-screen.webp']), deletedAt);
  }
  await runRetentionCleanup(x.env);
  assert.equal(x.sqlite.prepare('SELECT title FROM needs WHERE id=?').get('need').title, 'Safe need');
  assert.equal(x.sqlite.prepare('SELECT description FROM works WHERE id=?').get('active').description, 'Keep me');
  assert.equal(x.sqlite.prepare('SELECT description FROM works WHERE id=?').get('removed').description, '');
  assert.deepEqual(x.deletedMedia.sort(), ['removed-screen.webp', 'removed.webp']);
  x.sqlite.close();
});

test('operator cannot approve an old work that violates current rules', async () => {
  const { generateKeyPair, exportJWK, SignJWT } = await import('jose');
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  const x = setup();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.equal(String(url), 'https://moderation-test.example/cdn-cgi/access/certs');
    return Response.json({ keys: [{ ...jwk, kid: 'test', alg: 'RS256', use: 'sig' }] });
  };
  try {
    Object.assign(x.env, { CF_ACCESS_TEAM_DOMAIN: 'moderation-test.example', CF_ACCESS_AUD: 'test', ADMIN_EMAIL: 'moderator@example.test' });
    const token = await new SignJWT({ email: 'moderator@example.test' }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer('https://moderation-test.example').setAudience('test').setExpirationTime('5m').sign(privateKey);
    x.sqlite.exec(`INSERT INTO works(id,author_skr,name,summary,description,store_url,category,icon_key,created_at) VALUES('legacy','maker.skr','qqq','Summary','共产党','','其他','icon','2000-01-01');`);
    const response = await worker.fetch(new Request('https://example.test/admin/works/legacy/review', { method: 'POST', headers: { 'cf-access-jwt-assertion': token, 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'published' }) }), x.env, {});
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'content_not_allowed');
    assert.equal(x.sqlite.prepare('SELECT moderation_status FROM works WHERE id=?').get('legacy').moderation_status, 'pending');
  } finally { globalThis.fetch = originalFetch; x.sqlite.close(); }
});
