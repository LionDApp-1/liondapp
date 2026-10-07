import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Connection, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';

const require = createRequire(import.meta.url);
const Client = require('jayson/lib/client/browser');

test('reviewed Jayson override preserves Solana RPC request IDs, success and errors', async () => {
  const calls = [];
  const connection = new Connection('https://rpc.example.test', { fetch: async (_url, options) => {
    const request = JSON.parse(options.body);
    calls.push(request);
    assert.equal(request.jsonrpc, '2.0');
    assert.ok(typeof request.id === 'string' && request.id.length > 0);
    const result = request.method === 'getBalance'
      ? { result: { context: { slot: 42 }, value: 123456789 } }
      : { error: { code: -32000, message: 'synthetic RPC rejection' } };
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, ...result }), {
      headers: { 'content-type': 'application/json' },
    });
  } });
  const account = new PublicKey('11111111111111111111111111111111');
  assert.equal(await connection.getBalance(account), 123456789);
  await assert.rejects(connection.getSlot(), /synthetic RPC rejection/);
  assert.notEqual(calls[0].id, calls[1].id);
});

test('browser RPC notifications, batches and malformed replies keep their contract', async () => {
  const client = new Client((message, callback) => {
    const request = JSON.parse(message);
    callback(null, Array.isArray(request)
      ? JSON.stringify(request.map(r => ({ jsonrpc: '2.0', id: r.id, result: 7 })))
      : '{invalid JSON');
  });
  assert.equal(client.request('notify', [], null).id, undefined);
  const batch = [client.request('getSlot', []), client.request('getSlot', [])];
  await new Promise((resolve, reject) => client.request(batch, (error, result) => {
    if (error) return reject(error);
    assert.equal(result.length, 2);
    assert.equal(result[0].id, batch[0].id);
    resolve();
  }));
  await new Promise(resolve => client.request('getSlot', [], error => {
    assert.ok(error instanceof SyntaxError);
    resolve();
  }));
});

test('updated web3 serializes the same unsigned Solana transfer', () => {
  const from = new PublicKey('11111111111111111111111111111111');
  const to = new PublicKey('ANkFa3F2Ko83cCv3bgYjiTDiQVrWJfijvEeTABVYeJoW');
  const transaction = new Transaction({ feePayer: from, recentBlockhash: from.toBase58() })
    .add(SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports: 1 }));
  const restored = Transaction.from(transaction.serialize({ requireAllSignatures: false }));
  assert.equal(restored.feePayer.toBase58(), from.toBase58());
  assert.equal(restored.instructions[0].keys[1].pubkey.toBase58(), to.toBase58());
  assert.equal(restored.instructions[0].data.readBigUInt64LE(4), 1n);
  assert.ok(restored.signatures.every(s => s.signature === null));
});
