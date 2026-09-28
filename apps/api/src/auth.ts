import { Connection, PublicKey } from "@solana/web3.js";
import { TldParser } from "@onsol/tldparser";
import { ApiError } from "./http";
import { sha256 } from "./crypto";
import type { Env, SessionIdentity } from "./types";

export async function requireSession(request: Request, env: Env): Promise<SessionIdentity> {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw new ApiError(401, "authentication_required");
  const hash = await sha256(authorization.slice(7));
  const row = await env.DB.prepare(
    `SELECT s.skr_domain, s.wallet_address, u.status
     FROM sessions s JOIN users u ON u.skr_domain = s.skr_domain
     WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?`,
  ).bind(hash, new Date().toISOString()).first<{ skr_domain: string; wallet_address: string; status: string }>();
  if (!row) throw new ApiError(401, "invalid_session");
  if (row.status !== "active") throw new ApiError(403, "identity_blocked");
  return { skrDomain: row.skr_domain, walletAddress: row.wallet_address };
}

export async function optionalSession(request: Request, env: Env): Promise<SessionIdentity | null> {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  try {
    return await requireSession(request, env);
  } catch (error) {
    // Expired credentials must not prevent anonymous access to public content.
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function resolveSkrDomain(walletAddress: string, rpcUrl: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const parser = new TldParser(new Connection(rpcUrl, "confirmed"));
      const publicKey = new PublicKey(walletAddress);
      const domains = await parser.getParsedAllUserDomainsFromTld(publicKey, "skr");
      const names = domains.map((entry) => entry.domain.endsWith(".skr") ? entry.domain : `${entry.domain}.skr`).sort();
      if (names.length === 0) throw new ApiError(403, "skr_domain_required");
      const owner = await parser.getOwnerFromDomainTld(names[0]);
      const ownerAddress = owner?.toBase58();
      if (!ownerAddress || ownerAddress !== walletAddress) throw new ApiError(403, "skr_resolution_mismatch");
      return names[0].toLowerCase();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  console.error("skr_resolution_failed", { attempts: 3, error: lastError instanceof Error ? lastError.name : "unknown" });
  throw new ApiError(503, "skr_resolution_unavailable");
}
