import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

const bundled = await build({
  stdin: { contents: readFileSync('apps/api/src/index.ts', 'utf8') + '\nexport { runRetentionCleanup, adminRoute };\nexport { donationReadiness } from "./donations";', resolveDir: process.cwd() + '/apps/api/src', loader: 'ts' },
  bundle: true, platform: 'node', format: 'cjs', write: false,
});
const module = { exports: {} };
new Function('require', 'module', 'exports', bundled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { default: worker, runRetentionCleanup, donationReadiness } = module.exports;

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
  const request = (path, body, method = body ? 'POST' : 'GET', token = 'test-session') => worker.fetch(new Request(`https://example.test${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, { waitUntil() {} });
  for (const who of ['dev', 'outsider']) {
    sqlite.prepare("INSERT INTO users(skr_domain,wallet_address,terms_version,accepted_at,created_at,updated_at) VALUES(?,?,'v1','2000','2000','2000')").run(who + '.skr', who);
    sqlite.prepare("INSERT INTO auth_challenges VALUES(?,?,?,'message','2000','2099',NULL)").run(who, who, who);
    sqlite.prepare("INSERT INTO sessions(token_hash,challenge_id,skr_domain,wallet_address,created_at,expires_at) VALUES(?,?,?,?,'2000','2099')").run(createHash('sha256').update(who).digest('hex'), who, who + '.skr', who);
  }
  return { sqlite, env, request, deletedMedia, aiCalls: () => aiCalls };
}



const { Keypair, PublicKey, Transaction } = await import('@solana/web3.js');
const { base58 } = await import('@scure/base');
const payer = Keypair.generate();
const blockhash = Keypair.generate().publicKey.toBase58();
const MINT='SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3';
const RECEIVER='ANkFa3F2Ko83cCv3bgYjiTDiQVrWJfijvEeTABVYeJoW';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
function donationSetup(options={}) {
  const x=setup();Object.assign(x.env,{DONATIONS_ENABLED:'true',DONATION_RPC_URL:'https://rpc.test'});
  x.sqlite.prepare("UPDATE sessions SET wallet_address=? WHERE skr_domain='maker.skr'").run(payer.publicKey.toBase58());
  let confirmed=null;const calls=[];const original=globalThis.fetch;
  globalThis.fetch=async (url,init)=> {
    assert.equal(url,'https://rpc.test'); const {method,params}=JSON.parse(init.body);calls.push(method);let result;
    switch(method) {
      case 'getGenesisHash': result=options.network ?? '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';break;
      case 'getAccountInfo': {
        const data=Buffer.alloc(82);data[44]=6;data[45]=1;
        result={value:params[0]===MINT?{owner:options.mintOwner ?? TOKEN,data:[data.toString('base64'),'base64']}:null};break;
      }
      case 'getLatestBlockhash':result={value:{blockhash,lastValidBlockHeight:1000}};break;
      case 'simulateTransaction': result={value:{err:options.simulationError ?? null}};break;
      case 'getFeeForMessage':result={value:5000};break;
      case 'getMinimumBalanceForRentExemption':result=2039280;break;
      case 'getTransaction':result=confirmed;break;
      default:throw new Error('Unexpected RPC '+method);
    }
    return Response.json({jsonrpc:'2.0',id:1,result});
  };
  return {...x,calls,setConfirmed(value){confirmed=value;},close(){globalThis.fetch=original;x.sqlite.close();}};
}
async function quote(x, amount=10) {const r=await x.request('/v1/donations/quote',{amountSkr:amount});assert.equal(r.status,200);return r.json();}
function signed(q) { const tx=Transaction.from(Buffer.from(q.transaction,'base64'));tx.sign(payer);return {tx,signature:base58.encode(tx.signature),rpc:{transaction:[tx.serialize().toString('base64'),'base64'],meta:{err:null}}}; }

test('donations are independently gated and expose only the fixed project recipient',async()=>{
 const x=donationSetup();try{
  x.env.DONATIONS_ENABLED='false';assert.equal((await x.request('/v1/donations/quote',{amountSkr:10})).status,503);assert.equal(x.calls.length,0);
  const config=await (await x.request('/v1/donations/config')).json();assert.equal(config.enabled,false);assert.equal(config.receiverAddress,RECEIVER);assert.equal(config.mintAddress,MINT);
 }finally{x.close();}
});

test('tips require an HTTPS RPC and can reuse the existing secret without exposing it', async () => {
 for (const endpoint of [undefined, 'http://rpc.test', 'invalid']) {
  const x=donationSetup();try {
   x.env.DONATION_RPC_URL=endpoint;
   const config=await (await x.request('/v1/donations/config')).json();
   assert.equal(config.enabled,false);
   assert.equal((await x.request('/v1/donations/quote',{amountSkr:1})).status,503);
   assert.equal(x.calls.length,0);
  } finally { x.close(); }
 }
 const x=donationSetup();try {
  delete x.env.DONATION_RPC_URL;x.env.IDENTITY_RPC_URL_SECRET='https://rpc.test';
  const q=await quote(x,1);assert.equal(q.amountSkr,1);
  const config=await (await x.request('/v1/donations/config')).text();assert(!config.includes('rpc.test'));
 } finally { x.close(); }
});

test('operator preflight is read-only, works while tips are closed, and requires admin authentication', async () => {
 const x=donationSetup();try {
  x.env.DONATIONS_ENABLED='false';
  assert.equal((await x.request('/admin/donations/readiness')).status,401);
  assert.equal(x.calls.length,0);
  const result=await donationReadiness(x.env);
  assert.equal(result.enabled,false);assert.equal(result.rpcReady,true);
  assert.deepEqual(result.checks,['mainnet_genesis','skr_mint']);
  assert.deepEqual(x.calls,['getGenesisHash','getAccountInfo']);
  assert(!JSON.stringify(result).includes('rpc.test'));
  assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM donation_quotes').get().n,0);
 } finally { x.close(); }
 for (const options of [{network:'devnet'},{mintOwner:RECEIVER}]) {
  const x=donationSetup(options);try {await assert.rejects(donationReadiness(x.env));}finally{x.close();}
 }
});

test('Mainnet genesis validation uses the full RPC hash, not a shortened wallet chain reference', async () => {
 const full=donationSetup({network:'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'});
 try { assert.equal((await donationReadiness(full.env)).rpcReady,true); }
 finally { full.close(); }
 const short=donationSetup({network:'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'});
 try {
  await assert.rejects(donationReadiness(short.env), error => error.code==='donation_wrong_network');
  assert.equal((await short.request('/v1/donations/quote',{amountSkr:1})).status,503);
  assert.equal(short.sqlite.prepare('SELECT COUNT(*) n FROM donation_quotes').get().n,0);
 } finally { short.close(); }
});

test('prepared tips are unsigned exact-unit transfers with only the allowed recipient, mint, memo and ATA creation',async()=>{
 const x=donationSetup();try{
  const q=await quote(x);assert.equal(q.baseUnits,'10000000');assert.equal(q.accountRentLamports,'2039280');
  const tx=Transaction.from(Buffer.from(q.transaction,'base64'));assert.equal(tx.feePayer.toBase58(),payer.publicKey.toBase58());assert(tx.signatures.every(s=>s.signature===null));
  assert.equal(tx.instructions.length,3);const transfer=tx.instructions[1];assert.equal(transfer.programId.toBase58(),TOKEN);assert.equal(transfer.data[0],12);assert.equal(transfer.data.readBigUInt64LE(1),10000000n);assert.equal(transfer.data[9],6);assert.equal(transfer.keys[1].pubkey.toBase58(),MINT);
  const associated=new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
  const expected=PublicKey.findProgramAddressSync([new PublicKey(RECEIVER).toBuffer(),new PublicKey(TOKEN).toBuffer(),new PublicKey(MINT).toBuffer()],associated)[0];
  assert(transfer.keys[2].pubkey.equals(expected));assert.equal(tx.instructions[2].data.toString(),'LionDApp tip:'+q.quoteId);
  assert(x.calls.includes('simulateTransaction'));assert(!x.calls.includes('sendTransaction'));
 }finally{x.close();}
});

test('invalid amounts, wrong RPC network, wrong mint owner and simulation failure cannot prepare payment',async()=>{
 for(const amount of [0,-1,0.1,'10',1000001]) {const x=donationSetup();try{assert.equal((await x.request('/v1/donations/quote',{amountSkr:amount})).status,400);assert.equal(x.calls.length,0);}finally{x.close();}}
 for(const [options,status] of [[{network:'devnet'},503],[{mintOwner:RECEIVER},503],[{simulationError:'insufficient funds'},400]]) {
  const x=donationSetup(options);try{assert.equal((await x.request('/v1/donations/quote',{amountSkr:10})).status,status);assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM donation_quotes').get().n,0);}finally{x.close();}
 }
});

test('confirmation requires the exact finalized signed message and stays recoverable after expiry or disabling new tips',async()=>{
 const x=donationSetup();try{
  const q=await quote(x);const original=signed(q);const path='/v1/donations/'+q.quoteId+'/confirm';
  assert.equal((await (await x.request(path,{signature:original.signature})).json()).status,'pending');
  const modified=Transaction.from(Buffer.from(q.transaction,'base64'));modified.instructions[1].data.writeBigUInt64LE(1n,1);modified.sign(payer);
  x.setConfirmed({transaction:[modified.serialize().toString('base64'),'base64'],meta:{err:null}});
  assert.equal((await x.request(path,{signature:base58.encode(modified.signature)})).status,400);
  assert.equal((await x.request(path,{signature:original.signature},'POST','outsider')).status,404);
  x.setConfirmed(original.rpc);x.env.DONATIONS_ENABLED='false';x.sqlite.exec("UPDATE donation_quotes SET expires_at='2000-01-01'");
  assert.equal((await (await x.request(path,{signature:original.signature})).json()).status,'confirmed');
  assert.equal((await (await x.request(path,{signature:original.signature})).json()).status,'confirmed');
  assert.equal(x.sqlite.prepare('SELECT signature FROM donation_quotes').get().signature,original.signature);
 }finally{x.close();}
});

test('failed transactions are not acknowledged as successful; a receipt cannot satisfy a different quote',async()=>{
 const x=donationSetup();try{
  const q=await quote(x);const other=await quote(x);const original=signed(q);x.setConfirmed({...original.rpc,meta:{err:{InstructionError:[1,'failed']}}});
  assert.equal((await (await x.request('/v1/donations/'+q.quoteId+'/confirm',{signature:original.signature})).json()).status,'failed');
  assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM donation_quotes WHERE confirmed_at IS NOT NULL').get().n,0);
  x.setConfirmed(original.rpc);assert.equal((await x.request('/v1/donations/'+other.quoteId+'/confirm',{signature:original.signature})).status,400);
 }finally{x.close();}
});

test('incomplete recommendation payment confirmation stays closed even if onchain mode is configured', async () => {
 const x=setup();x.env.PAYMENT_MODE='onchain';
 const response=await x.request('/v1/promotion-orders/example/submit-confirm',{});
 assert.equal(response.status,503);assert.equal((await response.json()).error,'promotion_onchain_not_ready');
 x.sqlite.close();
});
