import { ApiError, json, readJson, now, id } from "./http";
import { randomToken, sha256 } from "./crypto";
import type { Env } from "./types";

const COOKIE = "__Host-liondapp_admin";
const encoder = new TextEncoder();
export function assertAdminOrigin(request: Request, env: Env): void {
  const origin = request.headers.get("origin");
  if (!origin || ![env.ADMIN_ORIGIN, env.ADMIN_PASSWORD_ORIGIN].filter(Boolean).includes(origin) || request.headers.get("x-liondapp-admin") !== "1") {
    throw new ApiError(403, "admin_origin_required");
  }
}
function token(request: Request): string | null {
  const matches = (request.headers.get("cookie") ?? "").split(";").map(p => p.trim()).filter(p => p.startsWith(COOKIE + "="));
  const value = matches.length === 1 ? matches[0].slice(COOKIE.length + 1) : "";
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export async function passwordSession(request: Request, env: Env): Promise<string | null> {
  const value = token(request);
  if (!value) return null;
  const row = await env.DB.prepare("SELECT username FROM admin_sessions WHERE token_hash=? AND expires_at>?").bind(await sha256(value), now()).first<{ username: string }>();
  if (!row) return null;
  if (!["GET", "HEAD"].includes(request.method)) assertAdminOrigin(request, env);
  return `password:${row.username}`;
}
// Workers WebCrypto bounds PBKDF2 to 100,000 iterations. A secret HMAC pepper
// additionally keeps a database-only leak from enabling offline password guesses.
export async function passwordHash(password: string, salt: string, env: Env): Promise<string> {
  if (!env.ABUSE_HASH_KEY || env.ABUSE_HASH_KEY.length < 32) throw new ApiError(503, "admin_auth_unavailable");
  const pepper = await crypto.subtle.importKey("raw", encoder.encode(env.ABUSE_HASH_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const material = await crypto.subtle.sign("HMAC", pepper, encoder.encode(`admin-password-v1:${password}`));
  const key = await crypto.subtle.importKey("raw", material, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: encoder.encode(salt), iterations: 100_000, hash: "SHA-256" }, key, 256);
  return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, "0")).join("");
}
function equal(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let n = 0; n < Math.max(a.length, b.length); n++) diff |= (a.charCodeAt(n) || 0) ^ (b.charCodeAt(n) || 0);
  return diff === 0;
}
async function rate(env: Env, identity: string, max: number): Promise<void> {
  // Store Unix seconds so the shared retention job can safely remove old rows.
  const epoch = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(`INSERT INTO rate_limits(identity_skr,action,window_started_at,hits) VALUES(?,'admin_login',?,1)
    ON CONFLICT(identity_skr,action) DO UPDATE SET
      hits=CASE WHEN excluded.window_started_at-window_started_at < 900 THEN hits+1 ELSE 1 END,
      window_started_at=CASE WHEN excluded.window_started_at-window_started_at < 900 THEN window_started_at ELSE excluded.window_started_at END
    RETURNING hits`).bind(identity, epoch).first<{ hits: number }>();
  if (!row || row.hits > max) throw new ApiError(429, "admin_login_rate_limited");
}
async function limitLogin(request: Request, env: Env) {
  await rate(env, "admin-global", 200);
  // cf-connecting-ip is supplied by Cloudflare; the Pages proxy forwards it unchanged.
  await rate(env, `admin-ip:${await sha256(`${env.ABUSE_HASH_KEY}:${request.headers.get("cf-connecting-ip") ?? "unknown"}`)}`, 15);
}
type Credential = { username: string; password_hash: string; salt: string };
async function credentials(env: Env) { return env.DB.prepare("SELECT username,password_hash,salt FROM admin_credentials WHERE id=1").first<Credential>(); }
function newCredentials(body: Record<string, unknown>) {
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(username)) throw new ApiError(400, "admin_username_invalid");
  if (password.length < 14 || password.length > 128) throw new ApiError(400, "admin_password_length");
  return { username, password };
}
function cookie(value: string, seconds: number) { return `${COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${seconds}`; }

export async function adminAuthRoute(path: string, request: Request, env: Env, access: (request: Request, env: Env) => Promise<string>): Promise<Response> {
  if (path === "/admin/auth/status" && request.method === "GET") {
    let accessVerified = false;
    try { await access(request, env); accessVerified = true; } catch { /* no password enrollment without Access */ }
    const authenticated = Boolean(await passwordSession(request, env)) || accessVerified;
    return json({ authenticated, accessVerified, configured: Boolean(await credentials(env)), consoleUrl: env.ADMIN_PASSWORD_ORIGIN });
  }
  if (request.method !== "POST") throw new ApiError(404, "not_found");
  assertAdminOrigin(request, env);
  if (path === "/admin/auth/logout") {
    const value = token(request);
    if (value) await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash=?").bind(await sha256(value)).run();
    return json({ loggedOut: true }, 200, { "set-cookie": cookie("", 0) });
  }
  if (path === "/admin/auth/setup") {
    const actor = await access(request, env);
    const body = newCredentials(await readJson(request, 2048));
    const salt = randomToken();
    const hash = await passwordHash(body.password, salt, env);
    // One operator, no public registration. Access-authenticated recovery resets
    // the password and atomically revokes every existing password session.
    await env.DB.batch([
      env.DB.prepare("INSERT INTO admin_credentials(id,username,password_hash,salt,updated_at) VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,password_hash=excluded.password_hash,salt=excluded.salt,updated_at=excluded.updated_at").bind(body.username, hash, salt, now()),
      env.DB.prepare("DELETE FROM admin_sessions"),
      env.DB.prepare("INSERT INTO audit_log(id,actor,action,target_type,target_id,detail_json,created_at) VALUES(?,?,'admin_password_set','admin','owner','{}',?)").bind(id("audit"), actor, now()),
    ]);
    return json({ configured: true, consoleUrl: env.ADMIN_PASSWORD_ORIGIN }, 200, { "set-cookie": cookie("", 0) });
  }
  if (path === "/admin/auth/login") {
    await limitLogin(request, env);
    const body = await readJson(request, 2048);
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body.password === "string" && body.password.length <= 128 ? body.password : "";
    const row = await credentials(env);
    const actual = await passwordHash(password, row?.salt ?? "no-configured-admin", env);
    if (!row || !equal(actual, row.password_hash) || !equal(username, row.username)) throw new ApiError(401, "admin_login_failed");
    const value = randomToken();
    const seconds = body.remember === true ? 30 * 86400 : 12 * 3600;
    await env.DB.batch([
      env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at<=?").bind(now()),
      env.DB.prepare("INSERT INTO admin_sessions(token_hash,username,created_at,expires_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM admin_credentials WHERE id=1 AND password_hash=?)").bind(await sha256(value), row.username, now(), new Date(Date.now() + seconds * 1000).toISOString(), row.password_hash),
    ]);
    return json({ authenticated: true }, 200, { "set-cookie": cookie(value, seconds) });
  }
  throw new ApiError(404, "not_found");
}
