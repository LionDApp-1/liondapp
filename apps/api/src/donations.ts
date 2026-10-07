import { Buffer } from "buffer";
import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { base58 } from "@scure/base";
import { requireSession } from "./auth";
import { requireAdmin } from "./admin";
import { ApiError, id, json, now, readJson } from "./http";
import type { Env } from "./types";

export const DONATION_RECEIVER = "ANkFa3F2Ko83cCv3bgYjiTDiQVrWJfijvEeTABVYeJoW";
export const DONATION_MINT = "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3";
const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const MINT = new PublicKey(DONATION_MINT);
const RECEIVER = new PublicKey(DONATION_RECEIVER);
const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";

export function donationAmount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 1_000_000) throw new ApiError(400, "invalid_donation_amount");
  return value;
}
export function associatedAccount(owner: PublicKey) {
  return PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN.toBuffer(), MINT.toBuffer()], ASSOCIATED)[0];
}
export function donationTransaction(payer: PublicKey, amount: number, quoteId: string, blockhash: string) {
  donationAmount(amount);
  const source = associatedAccount(payer), destination = associatedAccount(RECEIVER);
  const data = Buffer.alloc(10);
  data[0] = 12; // SPL Token TransferChecked
  data.writeBigUInt64LE(BigInt(amount) * 1_000_000n, 1);
  data[9] = 6;
  return new Transaction({ feePayer: payer, recentBlockhash: blockhash }).add(
    new TransactionInstruction({ programId: ASSOCIATED, data: Buffer.from([1]), keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: RECEIVER, isSigner: false, isWritable: false },
      { pubkey: MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN, isSigner: false, isWritable: false },
    ] }),
    new TransactionInstruction({ programId: TOKEN, data, keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: MINT, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: payer, isSigner: true, isWritable: false },
    ] }),
    new TransactionInstruction({ programId: MEMO, data: Buffer.from(`LionDApp tip:${quoteId}`), keys: [] }),
  );
}

async function rpc<T>(env: Env, method: string, params: unknown[] = []): Promise<T> {
  try {
    const endpoint = donationRpcEndpoint(env);
    if (!endpoint) throw new Error();
    const response = await fetch(endpoint, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(12000),
    });
    const body = await response.json() as { result: T; error?: unknown };
    if (!response.ok || body.error || !("result" in body)) throw new Error();
    return body.result;
  } catch { throw new ApiError(503, "donation_rpc_unavailable"); }
}

function donationRpcEndpoint(env: Env): string | null {
  // The identity endpoint already resolves Mainnet .skr ownership. Reuse its secret
  // when no dedicated tip endpoint is configured; never fall back to a public RPC.
  const endpoint = env.DONATION_RPC_URL || env.IDENTITY_RPC_URL_SECRET;
  if (!endpoint) return null;
  try { return new URL(endpoint).protocol === "https:" ? endpoint : null; } catch { return null; }
}
export function donationsEnabled(env: Env) { return env.DONATIONS_ENABLED === "true" && donationRpcEndpoint(env) !== null; }

async function verifyDonationNetwork(env: Env) {
  if (await rpc<string>(env, "getGenesisHash") !== MAINNET_GENESIS) throw new ApiError(503, "donation_wrong_network");
  const mint = await rpc<{ value: { owner: string; data: [string, string] } | null }>(env, "getAccountInfo", [DONATION_MINT, { encoding: "base64", commitment: "confirmed" }]);
  const mintData = Buffer.from(mint.value?.data[0] ?? "", "base64");
  if (mint.value?.owner !== TOKEN.toBase58() || mint.value?.data[1] !== "base64" || mintData.length !== 82 || mintData[44] !== 6 || mintData[45] !== 1) throw new ApiError(503, "invalid_mint_configuration");
}

/** Read-only operator preflight; no payer, quote, transaction simulation or transfer. */
export async function donationReadiness(env: Env) {
  await verifyDonationNetwork(env);
  return { enabled: donationsEnabled(env), rpcReady: true, network: "mainnet-beta", mintAddress: DONATION_MINT,
    receiverAddress: DONATION_RECEIVER, decimals: 6, checks: ["mainnet_genesis", "skr_mint"] };
}

interface Quote { id: string; message_base64: string; signature: string | null; confirmed_at: string | null; last_valid_block_height: number }
export async function donationRoute(path: string, request: Request, env: Env, rate: (env: Env, identity: string, action: string, seconds: number, hits?: number) => Promise<void>) {
  if (path === "/admin/donations/readiness") {
    await requireAdmin(request, env);
    if (request.method !== "GET") throw new ApiError(405, "method_not_allowed");
    return json(await donationReadiness(env));
  }
  if (path === "/v1/donations/config" && request.method === "GET") return json({ enabled: donationsEnabled(env), network: "mainnet-beta", mintAddress: DONATION_MINT, receiverAddress: DONATION_RECEIVER });
  const user = await requireSession(request, env);
  if (path === "/v1/donations/quote" && request.method === "POST") {
    if (!donationsEnabled(env)) throw new ApiError(503, "donations_disabled");
    await rate(env, user.skrDomain, "donation_quote", 60, 5);
    const amount = donationAmount((await readJson(request)).amountSkr);
    const payer = new PublicKey(user.walletAddress);
    if (payer.equals(RECEIVER)) throw new ApiError(400, "cannot_tip_self");
    await verifyDonationNetwork(env);
    const block = await rpc<{ value: { blockhash: string; lastValidBlockHeight: number } }>(env, "getLatestBlockhash", [{ commitment: "confirmed" }]);
    const quoteId = id("tip");
    const tx = donationTransaction(payer, amount, quoteId, block.value.blockhash);
    const message = tx.serializeMessage().toString("base64");
    const transaction = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
    const simulation = await rpc<{ value: { err: unknown } }>(env, "simulateTransaction", [transaction, { encoding: "base64", commitment: "confirmed", sigVerify: false }]);
    if (simulation.value.err) throw new ApiError(400, "donation_simulation_failed");
    const fee = await rpc<{ value: number | null }>(env, "getFeeForMessage", [message, { commitment: "confirmed" }]);
    const destination = await rpc<{ value: unknown }>(env, "getAccountInfo", [associatedAccount(RECEIVER).toBase58(), { encoding: "base64", commitment: "confirmed" }]);
    const rent = destination.value ? 0 : await rpc<number>(env, "getMinimumBalanceForRentExemption", [165]);
    if (!Number.isSafeInteger(fee.value) || (fee.value ?? -1) < 0 || !Number.isSafeInteger(rent) || rent < 0) throw new ApiError(503, "donation_rpc_unavailable");
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    await env.DB.prepare("INSERT INTO donation_quotes(id,donor_skr,wallet_address,amount_skr,message_base64,transaction_base64,last_valid_block_height,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .bind(quoteId, user.skrDomain, user.walletAddress, amount, message, transaction, block.value.lastValidBlockHeight, now(), expiresAt).run();
    return json({ quoteId, payerAddress: user.walletAddress, receiverAddress: DONATION_RECEIVER, mintAddress: DONATION_MINT,
      amountSkr: amount, baseUnits: (BigInt(amount) * 1_000_000n).toString(), network: "mainnet-beta", transaction,
      networkFeeLamports: String(fee.value), accountRentLamports: String(rent), expiresAt });
  }
  const quoteId = path.match(/^\/v1\/donations\/([^/]+)\/confirm$/)?.[1];
  if (quoteId && request.method === "POST") {
    await rate(env, user.skrDomain, "donation_confirm", 60, 30);
    const signature = String((await readJson(request)).signature ?? "");
    try { if (base58.decode(signature).length !== 64) throw new Error(); } catch { throw new ApiError(400, "invalid_signature"); }
    const quote = await env.DB.prepare("SELECT * FROM donation_quotes WHERE id=? AND donor_skr=? AND wallet_address=?").bind(quoteId, user.skrDomain, user.walletAddress).first<Quote>();
    if (!quote) throw new ApiError(404, "donation_not_found");
    if (quote.signature && quote.signature !== signature) throw new ApiError(409, "donation_signature_mismatch");
    if (quote.confirmed_at) return json({ status: "confirmed", signature });
    // Confirmation remains available even when new payments are disabled or the review has expired.
    if (await rpc<string>(env, "getGenesisHash") !== MAINNET_GENESIS) throw new ApiError(503, "donation_wrong_network");
    const result = await rpc<{ transaction: [string, string]; meta: { err: unknown } | null } | null>(env, "getTransaction", [signature, { encoding: "base64", commitment: "finalized", maxSupportedTransactionVersion: 0 }]);
    if (!result) return json({ status: "pending", signature });
    if (!result.meta) throw new ApiError(503, "donation_rpc_unavailable");
    let transaction: Transaction;
    try { transaction = Transaction.from(Buffer.from(result.transaction[0], "base64")); } catch { throw new ApiError(400, "donation_transaction_mismatch"); }
    if (transaction.serializeMessage().toString("base64") !== quote.message_base64 || !transaction.verifySignatures() || !transaction.signature || base58.encode(transaction.signature) !== signature) throw new ApiError(400, "donation_transaction_mismatch");
    if (result.meta.err) return json({ status: "failed", signature });
    const used = await env.DB.prepare("SELECT id FROM donation_quotes WHERE signature=? AND id!=?").bind(signature, quoteId).first();
    if (used) throw new ApiError(409, "signature_already_used");
    await env.DB.prepare("UPDATE donation_quotes SET signature=?,confirmed_at=? WHERE id=? AND confirmed_at IS NULL").bind(signature, now(), quoteId).run();
    return json({ status: "confirmed", signature });
  }
  throw new ApiError(404, "not_found");
}
