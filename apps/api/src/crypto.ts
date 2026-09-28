import { base58 } from "@scure/base";
import { ed25519 } from "@noble/curves/ed25519.js";

const encoder = new TextEncoder();

export function randomToken(bytes = 32): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function verifyWalletSignature(message: string, signature: string, walletAddress: string): boolean {
  try {
    return ed25519.verify(base58.decode(signature), encoder.encode(message), base58.decode(walletAddress));
  } catch {
    return false;
  }
}

export function createSiwsMessage(input: {
  domain: string;
  walletAddress: string;
  statement: string;
  uri: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
  chainId: string;
}): string {
  return `${input.domain} wants you to sign in with your Solana account:\n${input.walletAddress}\n\n${input.statement}\n\nURI: ${input.uri}\nVersion: 1\nChain ID: ${input.chainId}\nNonce: ${input.nonce}\nIssued At: ${input.issuedAt}\nExpiration Time: ${input.expirationTime}`;
}
