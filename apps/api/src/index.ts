import { adminAuthRoute } from "./admin-password";
import { operationsRoute } from "./operations";
import { PublicKey } from "@solana/web3.js";
import { requireAdmin, requireAccessAdmin } from "./admin";
import { optionalSession, requireSession, resolveSkrDomain } from "./auth";
import { createSiwsMessage, randomToken, sha256, verifyWalletSignature } from "./crypto";
import { ApiError, id, json, now, parseJsonArray, readBinary, readFormData, readJson } from "./http";
import { sanitizeWebp } from "./media";
import { assessContentPolicy, contentFields, isPublicContentAllowed, MODERATION_VERSION } from "./moderation";
import type { Env, JsonMap, SessionIdentity } from "./types";
import { categories, commentPayload, needPayload, workPayload } from "./validation";
import { serializeStoreApp, syncStoreCatalog, translateStoreCatalogBatch, runCatalogTranslation } from "./store-catalog";
import { translationBudgetStatus } from "./translation-budget";
import { chatRoute } from "./chat";
import { donationRoute, donationsEnabled } from "./donations";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_MEDIA_BODY_BYTES = MAX_IMAGE_BYTES + 64 * 1024;
const CANONICAL_SKR_MINT = "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3";
const RECOMMENDATION_RECEIVER = "ANkFa3F2Ko83cCv3bgYjiTDiQVrWJfijvEeTABVYeJoW";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get("origin");
    const cors: Record<string, string> = origin === env.ADMIN_ORIGIN ? {
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "authorization,content-type,cf-access-jwt-assertion",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "vary": "origin",
    } : {};
    if (request.method === "OPTIONS") return secureResponse(new Response(null, { status: 204 }), cors);

    try {
      return secureResponse(await route(request, env, ctx), cors);
    } catch (error) {
      if (error instanceof ApiError) return secureResponse(json({ error: error.code }, error.status), cors);
      console.error(error);
      return secureResponse(json({ error: "internal_error" }, 500), cors);
    }
  },
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    const tasks = _controller.cron === "*/2 * * * *" ? [runCatalogTranslation(env)] : [runRetentionCleanup(env), syncStoreCatalog(env)];
    ctx.waitUntil(Promise.allSettled(tasks).then((results) => {
      const failed = results.filter((result) => result.status === "rejected");
      if (failed.length) console.error("scheduled_tasks_failed", failed.map((result) => result.status === "rejected" ? String(result.reason instanceof Error ? result.reason.message : result.reason) : "unknown"));
    }));
  },
};

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (path.startsWith("/admin/auth/")) return adminAuthRoute(path, request, env, requireAccessAdmin);
  if (path.startsWith("/v1/donations/") || path === "/admin/donations/readiness") return donationRoute(path, request, env, consumeRate);
  if (path.startsWith("/v1/conversations") || path.startsWith("/admin/message-reports")) {
    return chatRoute(path, request, env, { moderate: enforceContentPolicy, rate: consumeRate });
  }

  if (request.method === "GET" && path === "/health") return health(env);
  if (request.method === "GET" && path === "/v1/config") return publicConfig(env);
  if (request.method === "POST" && path === "/v1/auth/challenge") return createChallenge(request, env);
  if (request.method === "POST" && path === "/v1/auth/verify") return verifyChallenge(request, env);
  if (request.method === "POST" && path === "/v1/auth/logout") return logout(request, env);
  if (request.method === "GET" && path === "/v1/search") return search(request, url, env);
  if (request.method === "GET" && path === "/v1/store-apps") return listStoreApps(url, env);
  const storeAppId = match(path, /^\/v1\/store-apps\/([^/]+)$/);
  if (storeAppId && request.method === "GET") return getStoreApp(storeAppId, env);
  if (request.method === "GET" && path === "/v1/needs") return listNeeds(request, url, env);
  if (request.method === "POST" && path === "/v1/needs") return createNeed(request, env);
  if (request.method === "GET" && path === "/v1/works") return listWorks(request, url, env);
  if (request.method === "POST" && path === "/v1/works") return createWork(request, env);
  if (request.method === "GET" && path === "/v1/me") return me(request, env);
  if (request.method === "PUT" && path === "/v1/me") return updateProfile(request, env);
  if (request.method === "DELETE" && path === "/v1/me") return deleteAccount(request, env);
  if (request.method === "GET" && path === "/v1/notifications") return notifications(request, env);
  if (request.method === "GET" && path === "/v1/blocks") return listBlocks(request, env);
  if (request.method === "POST" && path === "/v1/media") return uploadMedia(request, env);
  if (request.method === "GET" && path.startsWith("/media/")) return getMedia(path.slice(7), request, env, ctx);
  if (request.method === "GET" && path === "/v1/announcements") return announcements(env);
  if (request.method === "POST" && path === "/v1/reports") return createReport(request, env);

  const needId = match(path, /^\/v1\/needs\/([^/]+)$/);
  if (needId && request.method === "GET") return getNeed(needId, request, env);
  if (needId && request.method === "DELETE") return deleteOwned("needs", needId, request, env);
  const workId = match(path, /^\/v1\/works\/([^/]+)$/);
  if (workId && request.method === "GET") return getWork(workId, request, env);
  if (workId && request.method === "DELETE") return deleteOwned("works", workId, request, env);
  const profileDomain = match(path, /^\/v1\/profiles\/([^/]+\.skr)$/);
  if (profileDomain && request.method === "GET") return publicProfile(profileDomain, request, env);
  const blockedDomain = match(path, /^\/v1\/blocks\/([^/]+\.skr)$/);
  if (blockedDomain && request.method === "POST") return blockUser(blockedDomain, request, env);
  if (blockedDomain && request.method === "DELETE") return unblockUser(blockedDomain, request, env);
  const commentsTarget = path.match(/^\/v1\/(needs|works)\/([^/]+)\/comments$/);
  if (commentsTarget && request.method === "GET") return listComments(commentsTarget[1] === "needs" ? "need" : "work", commentsTarget[2], request, url, env);
  if (commentsTarget && request.method === "POST") return createComment(commentsTarget[1] === "needs" ? "need" : "work", commentsTarget[2], request, env);
  const commentId = match(path, /^\/v1\/comments\/([^/]+)$/);
  if (commentId && request.method === "DELETE") return deleteOwned("comments", commentId, request, env);
  const reaction = path.match(/^\/v1\/(needs|works|comments)\/([^/]+)\/reaction$/);
  if (reaction && request.method === "POST") return toggleReaction(reaction[1], reaction[2], request, env);
  const promotionWork = match(path, /^\/v1\/works\/([^/]+)\/promotion-order$/);
  if (promotionWork && request.method === "POST") return createPromotionOrder(promotionWork, request, env);
  const simulateOrder = match(path, /^\/v1\/promotion-orders\/([^/]+)\/simulate-confirm$/);
  if (simulateOrder && request.method === "POST") return simulatePromotion(simulateOrder, request, env);
  const submitOrder = match(path, /^\/v1\/promotion-orders\/([^/]+)\/submit-confirm$/);
  if (submitOrder && request.method === "POST") return submitPromotion(submitOrder, request, env);

  if (path.startsWith("/admin/")) return adminRoute(path, request, env);
  throw new ApiError(404, "not_found");
}

function match(path: string, pattern: RegExp): string | null {
  return path.match(pattern)?.[1] ?? null;
}

async function health(env: Env): Promise<Response> {
  const row = await env.DB.prepare("SELECT value FROM config WHERE key = 'mainnet_payments_enabled'").first<{ value: string }>();
  return json({ service: "liondapp-api", environment: env.ENVIRONMENT, paymentMode: env.PAYMENT_MODE, mainnetPaymentsEnabled: row?.value === "true", donationsEnabled: donationsEnabled(env), moderationVersion: MODERATION_VERSION, moderationMode: "rules-and-ai" });
}

async function publicConfig(env: Env): Promise<Response> {
  const price = positiveWholeNumber(await configValue(env, "recommendation_price_skr", env.DEFAULT_RECOMMENDATION_PRICE), "invalid_price_configuration");
  const durationDays = positiveWholeNumber(env.RECOMMENDATION_DAYS, "invalid_duration_configuration", 365);
  const catalog = await env.DB.prepare("SELECT COUNT(*) AS active,SUM(CASE WHEN translated_at IS NOT NULL THEN 1 ELSE 0 END) AS translated FROM store_catalog WHERE active=1").first<{ active: number; translated: number }>();
  return json({ categories, recommendation: { priceSkr: price, durationDays }, environment: env.ENVIRONMENT, catalog: { active: Number(catalog?.active ?? 0), translated: Number(catalog?.translated ?? 0) } });
}

async function createChallenge(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const walletAddress = String(body.walletAddress ?? "");
  try { new PublicKey(walletAddress); } catch { throw new ApiError(400, "invalid_wallet_address"); }
  await consumeRate(env, await anonymousIdentity(request, env), "challenge_ip", 300, 20);
  await consumeRate(env, walletAddress, "challenge", 10);
  const created = new Date();
  const expires = new Date(created.getTime() + 5 * 60_000);
  const nonce = randomToken(16);
  const challengeId = id("ch");
  const message = createSiwsMessage({
    domain: new URL(env.APP_ORIGIN).host,
    walletAddress,
    statement: "Sign in to LionDApp. This request does not authorize a transaction.",
    uri: env.APP_ORIGIN,
    nonce,
    issuedAt: created.toISOString(),
    expirationTime: expires.toISOString(),
    chainId: env.AUTH_CHAIN_ID,
  });
  await env.DB.prepare("INSERT INTO auth_challenges(id,wallet_address,nonce,message,issued_at,expires_at) VALUES(?,?,?,?,?,?)")
    .bind(challengeId, walletAddress, nonce, message, created.toISOString(), expires.toISOString()).run();
  return json({ challengeId, message, nonce, issuedAt: created.toISOString(), expirationTime: expires.toISOString(), domain: new URL(env.APP_ORIGIN).host, uri: env.APP_ORIGIN, chainId: env.AUTH_CHAIN_ID });
}

async function verifyChallenge(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  await consumeRate(env, await anonymousIdentity(request, env), "verify_ip", 300, 30);
  const challengeId = String(body.challengeId ?? "");
  const walletAddress = String(body.walletAddress ?? "");
  const signature = String(body.signature ?? "");
  const signedMessage = String(body.signedMessage ?? "");
  const challenge = await env.DB.prepare("SELECT * FROM auth_challenges WHERE id = ?").bind(challengeId)
    .first<{ wallet_address: string; message: string; expires_at: string; consumed_at: string | null }>();
  if (!challenge || challenge.consumed_at || challenge.expires_at <= now()) throw new ApiError(401, "challenge_expired");
  if (walletAddress !== challenge.wallet_address || signedMessage !== challenge.message) throw new ApiError(401, "challenge_mismatch");
  if (!verifyWalletSignature(signedMessage, signature, walletAddress)) throw new ApiError(401, "invalid_signature");
  const skrDomain = await resolveSkrDomain(walletAddress, env.IDENTITY_RPC_URL_SECRET);
  const termsAccepted = body.acceptTerms === true;
  const ageConfirmed = body.confirmAge === true;
  if (!termsAccepted || !ageConfirmed) throw new ApiError(400, "consent_required");
  const termsVersion = await configValue(env, "terms_version", "2026-09-06");
  const createdAt = now();
  const existingUser = await env.DB.prepare("SELECT status FROM users WHERE skr_domain=?").bind(skrDomain).first<{ status: string }>();
  if (existingUser?.status === "blocked") throw new ApiError(403, "identity_blocked");
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const sessionTtl = positiveWholeNumber(env.SESSION_TTL_SECONDS, "invalid_session_configuration", 7 * 86_400);
  const expiresAt = new Date(Date.now() + sessionTtl * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE auth_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL").bind(createdAt, challengeId),
    env.DB.prepare(`INSERT INTO users(skr_domain,wallet_address,locale,status,terms_version,accepted_at,created_at,updated_at)
      VALUES(?,?,?,'active',?,?,?,?) ON CONFLICT(skr_domain) DO UPDATE SET wallet_address=excluded.wallet_address, locale=excluded.locale,
      status='active', terms_version=excluded.terms_version, accepted_at=excluded.accepted_at, updated_at=excluded.updated_at, deleted_at=NULL`)
      .bind(skrDomain, walletAddress, body.locale === "zh" ? "zh" : "en", termsVersion, createdAt, createdAt, createdAt),
    env.DB.prepare("INSERT INTO sessions(token_hash,challenge_id,skr_domain,wallet_address,created_at,expires_at) VALUES(?,?,?,?,?,?)")
      .bind(tokenHash, challengeId, skrDomain, walletAddress, createdAt, expiresAt),
  ]);
  return json({ token, expiresAt, user: { skrDomain, walletAddress } });
}

async function logout(request: Request, env: Env): Promise<Response> {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.startsWith("Bearer ")) await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?")
    .bind(now(), await sha256(authorization.slice(7))).run();
  return new Response(null, { status: 204 });
}

async function listNeeds(request: Request, url: URL, env: Env): Promise<Response> {
  const viewer = await optionalSession(request, env);
  const sort = url.searchParams.get("sort") ?? "latest";
  const secondary = sort === "needed" ? "need_count DESC," : sort === "discussed" ? "comment_count DESC," : "";
  const order = `CASE WHEN request_type='paid_development' THEN 0 ELSE 1 END, COALESCE(budget_skr, 0) DESC, ${secondary} created_at DESC, id DESC`;
  const category = url.searchParams.get("category");
  const sql = `SELECT * FROM needs WHERE deleted_at IS NULL ${category ? "AND category = ?" : ""} ${viewer ? "AND author_skr NOT IN (SELECT blocked_skr FROM user_blocks WHERE blocker_skr = ?)" : ""} ORDER BY ${order} LIMIT 50`;
  const values = [...(category ? [category] : []), ...(viewer ? [viewer.skrDomain] : [])];
  const statement = env.DB.prepare(sql);
  const result = values.length ? await statement.bind(...values).all() : await statement.all();
  return json({ items: result.results.filter((row) => isPublicContentAllowed("need", row)).map(serializeNeed) });
}

async function getNeed(needId: string, request: Request, env: Env): Promise<Response> {
  const row = await env.DB.prepare("SELECT * FROM needs WHERE id = ? AND deleted_at IS NULL").bind(needId).first();
  if (!row || !isPublicContentAllowed("need", row)) throw new ApiError(404, "need_not_found");
  await assertAuthorVisible(request, String(row.author_skr), env);
  return json(serializeNeed(row));
}

async function createNeed(request: Request, env: Env): Promise<Response> {
  const user = await requireSession(request, env);
  await consumeRate(env, user.skrDomain, "post", 60);
  const payload = needPayload(await readJson(request));
  await enforceContentPolicy(env, user, "need", [payload.title, payload.problem, payload.solutionIdea, payload.audience, ...payload.tags]);
  await assertMediaOwnership(payload.mediaKeys, user.skrDomain, env);
  const needId = id("need");
  const createdAt = now();
  await env.DB.prepare(`INSERT INTO needs(id,author_skr,title,problem,solution_idea,audience,category,tags_json,media_json,format,request_type,budget_skr,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(needId, user.skrDomain, payload.title, payload.problem, payload.solutionIdea, payload.audience,
      payload.category, JSON.stringify(payload.tags), JSON.stringify(payload.mediaKeys), payload.format, payload.requestType, payload.budgetSkr, createdAt).run();
  return json({ id: needId, createdAt }, 201);
}

async function listWorks(request: Request, url: URL, env: Env): Promise<Response> {
  const viewer = await optionalSession(request, env);
  const sort = url.searchParams.get("sort") ?? "latest";
  const order = sort === "liked" ? "like_count DESC, created_at DESC" : sort === "discussed" ? "comment_count DESC, created_at DESC" : "created_at DESC";
  const category = url.searchParams.get("category");
  const timestamp = now();
  const hidden = viewer ? "AND author_skr NOT IN (SELECT blocked_skr FROM user_blocks WHERE blocker_skr = ?)" : "";
  const query = `SELECT * FROM works WHERE deleted_at IS NULL AND moderation_status = 'published' AND (promoted_until IS NULL OR promoted_until <= ?) ${category ? "AND category=?" : ""} ${hidden} ORDER BY ${order} LIMIT 50`;
  const values = [timestamp, ...(category ? [category] : []), ...(viewer ? [viewer.skrDomain] : [])];
  const result = await env.DB.prepare(query).bind(...values).all();
  const promotedValues = [timestamp, ...(viewer ? [viewer.skrDomain] : [])];
  const promoted = await env.DB.prepare(`SELECT * FROM works WHERE deleted_at IS NULL AND moderation_status = 'published' AND promoted_until > ? ${hidden} ORDER BY RANDOM() LIMIT 30`).bind(...promotedValues).all();
  return json({ promoted: promoted.results.filter((row) => isPublicContentAllowed("work", row)).map(serializeWork), items: result.results.filter((row) => isPublicContentAllowed("work", row)).map(serializeWork) });
}

async function getWork(workId: string, request: Request, env: Env): Promise<Response> {
  const row = await env.DB.prepare("SELECT * FROM works WHERE id = ? AND deleted_at IS NULL AND moderation_status = 'published'").bind(workId).first();
  if (!row || !isPublicContentAllowed("work", row)) throw new ApiError(404, "work_not_found");
  await assertAuthorVisible(request, String(row.author_skr), env);
  return json(serializeWork(row));
}

async function createWork(request: Request, env: Env): Promise<Response> {
  const user = await requireSession(request, env);
  await consumeRate(env, user.skrDomain, "post", 60);
  const payload = workPayload(await readJson(request));
  await enforceContentPolicy(env, user, "work", [payload.name, payload.summary, payload.description, payload.demoUrl ?? "", ...payload.tags]);
  await assertMediaOwnership([payload.iconKey, ...payload.screenshotKeys], user.skrDomain, env);
  const workId = id("work");
  const createdAt = now();
  await env.DB.prepare(`INSERT INTO works(id,author_skr,name,summary,description,store_url,category,tags_json,icon_key,screenshots_json,demo_url,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(workId, user.skrDomain, payload.name, payload.summary, payload.description, payload.storeUrl,
      payload.category, JSON.stringify(payload.tags), payload.iconKey, JSON.stringify(payload.screenshotKeys), payload.demoUrl, createdAt).run();
  return json({ id: workId, status: "pending", createdAt }, 201);
}

async function search(request: Request, url: URL, env: Env): Promise<Response> {
  const viewer = await optionalSession(request, env);
  const query = (url.searchParams.get("q") ?? "").trim();
  if (query.length < 2 || query.length > 100) throw new ApiError(400, "invalid_search_query");
  const pattern = `%${query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  const hidden = viewer ? "AND author_skr NOT IN (SELECT blocked_skr FROM user_blocks WHERE blocker_skr = ?)" : "";
  const [needs, works] = await Promise.all([
    env.DB.prepare(`SELECT * FROM needs WHERE deleted_at IS NULL AND (title LIKE ? ESCAPE '\\' OR problem LIKE ? ESCAPE '\\' OR solution_idea LIKE ? ESCAPE '\\' OR audience LIKE ? ESCAPE '\\' OR tags_json LIKE ? ESCAPE '\\') ${hidden} ORDER BY CASE WHEN request_type='paid_development' THEN 0 ELSE 1 END, COALESCE(budget_skr,0) DESC, need_count DESC,created_at DESC LIMIT 30`)
      .bind(pattern, pattern, pattern, pattern, pattern, ...(viewer ? [viewer.skrDomain] : [])).all(),
    env.DB.prepare(`SELECT * FROM works WHERE deleted_at IS NULL AND moderation_status='published' AND (name LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR tags_json LIKE ? ESCAPE '\\') ${hidden} ORDER BY like_count DESC,created_at DESC LIMIT 30`)
      .bind(pattern, pattern, pattern, pattern, ...(viewer ? [viewer.skrDomain] : [])).all(),
  ]);
  const storeApps = await searchStoreCatalog(query, 30, env);
  return json({ needs: needs.results.filter((row) => isPublicContentAllowed("need", row)).map(serializeNeed), works: works.results.filter((row) => isPublicContentAllowed("work", row)).map(serializeWork), storeApps: storeApps.results.map(serializeStoreApp) });
}

async function listStoreApps(url: URL, env: Env): Promise<Response> {
  const query = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 100);
  if (query.length > 100) throw new ApiError(400, "invalid_search_query");
  const result = await searchStoreCatalog(query, limit, env);
  return json({ items: result.results.map(serializeStoreApp) });
}

async function searchStoreCatalog(query: string, limit: number, env: Env) {
  const expansions: Record<string, string[]> = {
    "钱包": ["wallet"], "交易": ["trade", "swap", "exchange"], "兑换": ["swap", "exchange"], "支付": ["payment", "pay"],
    "游戏": ["game"], "社交": ["social", "chat"], "聊天": ["chat", "message"], "视频": ["video", "stream"], "音乐": ["music", "audio"],
    "隐私": ["privacy"], "安全": ["security"], "效率": ["productivity"], "借贷": ["lend", "borrow"], "质押": ["stake", "staking"],
  };
  const terms = [query];
  for (const [keyword, translated] of Object.entries(expansions)) if (query.includes(keyword)) terms.push(...translated);
  const patterns = [...new Set(terms)].slice(0, 5).map((term) => `%${term.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
  const fields = ["android_package", "display_name", "subtitle", "description", "subtitle_zh", "description_zh", "publisher_name", "category_name", "category_name_zh"];
  const clauses = patterns.flatMap(() => fields.map((field) => `${field} LIKE ? ESCAPE '\\'`));
  const values = patterns.flatMap((entry) => fields.map(() => entry));
  const titleClauses = patterns.flatMap(() => ["display_name LIKE ? ESCAPE '\\'", "subtitle LIKE ? ESCAPE '\\'"]);
  const titleValues = patterns.flatMap((entry) => [entry, entry]);
  const descriptionClauses = patterns.map(() => "description LIKE ? ESCAPE '\\'");
  return env.DB.prepare(`SELECT * FROM store_catalog WHERE active=1 AND (${clauses.join(" OR ")}) ORDER BY CASE WHEN (${titleClauses.join(" OR ")}) THEN 0 WHEN (${descriptionClauses.join(" OR ")}) THEN 1 ELSE 2 END, rating DESC NULLS LAST, display_name ASC LIMIT ${limit}`).bind(...values, ...titleValues, ...patterns).all();
}

async function getStoreApp(packageName: string, env: Env): Promise<Response> {
  const decoded = decodeURIComponent(packageName);
  const row = await env.DB.prepare("SELECT * FROM store_catalog WHERE android_package=? AND active=1").bind(decoded).first();
  if (!row) throw new ApiError(404, "store_app_not_found");
  return json(serializeStoreApp(row));
}

async function listComments(targetType: "need" | "work", targetId: string, request: Request, url: URL, env: Env): Promise<Response> {
  const viewer = await optionalSession(request, env);
  await assertTargetExists(targetType, targetId, env);
  const sort = url.searchParams.get("sort") === "latest" ? "created_at DESC" : "like_count DESC, created_at DESC";
  const hidden = viewer ? "AND author_skr NOT IN (SELECT blocked_skr FROM user_blocks WHERE blocker_skr = ?)" : "";
  const result = await env.DB.prepare(`SELECT * FROM comments WHERE target_type=? AND target_id=? AND deleted_at IS NULL ${hidden} ORDER BY parent_id IS NOT NULL, ${sort} LIMIT 200`)
    .bind(targetType, targetId, ...(viewer ? [viewer.skrDomain] : [])).all();
  const rows = result.results.filter((row) => isPublicContentAllowed("comment", row)) as Array<Record<string, unknown>>;
  const top = rows.filter((row) => row.parent_id == null);
  const replies = new Map<string, Array<Record<string, unknown>>>();
  rows.filter((row) => row.parent_id != null).forEach((row) => {
    const parentId = String(row.parent_id);
    replies.set(parentId, [...(replies.get(parentId) ?? []), row]);
  });
  return json({ items: top.flatMap((row) => [row, ...(replies.get(String(row.id)) ?? [])]) });
}

async function createComment(targetType: "need" | "work", targetId: string, request: Request, env: Env): Promise<Response> {
  const user = await requireSession(request, env);
  await consumeRate(env, user.skrDomain, "comment", 10);
  await assertTargetExists(targetType, targetId, env);
  const payload = commentPayload(await readJson(request));
  await enforceContentPolicy(env, user, "comment", [payload.body]);
  if (payload.parentId) {
    const parent = await env.DB.prepare("SELECT parent_id FROM comments WHERE id=? AND target_type=? AND target_id=? AND deleted_at IS NULL")
      .bind(payload.parentId, targetType, targetId).first<{ parent_id: string | null }>();
    if (!parent || parent.parent_id) throw new ApiError(400, "invalid_comment_parent");
  }
  const commentId = id("comment");
  const createdAt = now();
  const table = targetType === "need" ? "needs" : "works";
  const target = await env.DB.prepare(`SELECT author_skr FROM ${table} WHERE id=?`).bind(targetId).first<{ author_skr: string }>();
  const parent = payload.parentId ? await env.DB.prepare("SELECT author_skr FROM comments WHERE id=?").bind(payload.parentId).first<{ author_skr: string }>() : null;
  const statements = [
    env.DB.prepare("INSERT INTO comments(id,author_skr,target_type,target_id,parent_id,body,created_at) VALUES(?,?,?,?,?,?,?)")
      .bind(commentId, user.skrDomain, targetType, targetId, payload.parentId, payload.body, createdAt),
  ];
  const recipient = parent?.author_skr ?? target?.author_skr;
  if (recipient && recipient !== user.skrDomain) statements.push(
    env.DB.prepare("INSERT INTO notifications(id,recipient_skr,type,payload_json,created_at) VALUES(?,?,?,?,?)")
      .bind(id("notification"), recipient, parent ? "comment_reply" : "content_comment", JSON.stringify({ targetType, targetId, commentId }), createdAt),
  );
  await env.DB.batch(statements);
  return json({ id: commentId, createdAt }, 201);
}

async function toggleReaction(kind: string, targetId: string, request: Request, env: Env): Promise<Response> {
  const user = await requireSession(request, env);
  await consumeRate(env, user.skrDomain, "reaction", 1);
  const targetType = kind === "needs" ? "need" : kind === "works" ? "work" : "comment";
  const reactionType = targetType === "need" ? "need" : "like";
  const table = targetType === "need" ? "needs" : targetType === "work" ? "works" : "comments";
  const existing = await env.DB.prepare("SELECT 1 FROM reactions WHERE identity_skr=? AND target_type=? AND target_id=?")
    .bind(user.skrDomain, targetType, targetId).first();
  if (existing) {
    await env.DB.prepare("DELETE FROM reactions WHERE identity_skr=? AND target_type=? AND target_id=?").bind(user.skrDomain, targetType, targetId).run();
    return json({ active: false });
  }
  const target = await env.DB.prepare(`SELECT id FROM ${table} WHERE id=? AND deleted_at IS NULL`).bind(targetId).first();
  if (!target) throw new ApiError(404, "target_not_found");
  await env.DB.prepare("INSERT INTO reactions(identity_skr,target_type,target_id,reaction_type,created_at) VALUES(?,?,?,?,?)")
    .bind(user.skrDomain, targetType, targetId, reactionType, now()).run();
  return json({ active: true });
}

async function deleteOwned(table: "needs" | "works" | "comments", targetId: string, request: Request, env: Env): Promise<Response> {
  const user = await requireSession(request, env);
  if (table === "comments") {
    const comment = await env.DB.prepare("SELECT id FROM comments WHERE id=? AND author_skr=? AND deleted_at IS NULL")
      .bind(targetId, user.skrDomain).first<{ id: string }>();
    if (!comment) throw new ApiError(404, "content_not_found");
    const result = await env.DB.prepare("UPDATE comments SET deleted_at=? WHERE id=? AND author_skr=? AND deleted_at IS NULL")
      .bind(now(), targetId, user.skrDomain).run();
    if (!result.meta.changes) throw new ApiError(404, "content_not_found");
    return new Response(null, { status: 204 });
  }
  const result = await env.DB.prepare(`UPDATE ${table} SET deleted_at=? WHERE id=? AND author_skr=? AND deleted_at IS NULL`)
    .bind(now(), targetId, user.skrDomain).run();
  if (!result.meta.changes) throw new ApiError(404, "content_not_found");
  return new Response(null, { status: 204 });
}

async function me(request: Request, env: Env): Promise<Response> {
  const user = await requireSession(request, env);
  const profile = await env.DB.prepare("SELECT skr_domain,bio,social_url,locale,created_at FROM users WHERE skr_domain=?").bind(user.skrDomain).first();
  const [needs, works] = await Promise.all([
    env.DB.prepare("SELECT * FROM needs WHERE author_skr=? AND deleted_at IS NULL ORDER BY created_at DESC").bind(user.skrDomain).all(),
    env.DB.prepare("SELECT * FROM works WHERE author_skr=? AND deleted_at IS NULL ORDER BY created_at DESC").bind(user.skrDomain).all(),
  ]);
  return json({ profile, needs: needs.results.map(serializeNeed), works: works.results.map(serializeWork) });
}

async function publicProfile(skrDomain: string, request: Request, env: Env): Promise<Response> {
  await assertAuthorVisible(request, skrDomain.toLowerCase(), env);
  const profile = await env.DB.prepare("SELECT skr_domain,bio,social_url,created_at FROM users WHERE skr_domain=? AND status='active'").bind(skrDomain.toLowerCase()).first();
  if (!profile) throw new ApiError(404, "profile_not_found");
  const [needs, works] = await Promise.all([
    env.DB.prepare("SELECT * FROM needs WHERE author_skr=? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50").bind(skrDomain.toLowerCase()).all(),
    env.DB.prepare("SELECT * FROM works WHERE author_skr=? AND deleted_at IS NULL AND moderation_status='published' ORDER BY created_at DESC LIMIT 50").bind(skrDomain.toLowerCase()).all(),
  ]);
  return json({ profile: isPublicContentAllowed("profile", profile) ? profile : { ...profile, bio: null, social_url: null }, needs: needs.results.filter((row) => isPublicContentAllowed("need", row)).map(serializeNeed), works: works.results.filter((row) => isPublicContentAllowed("work", row)).map(serializeWork) });
}

async function updateProfile(request: Request, env: Env): Promise<Response> {
  const user = await requireSession(request, env);
  const body = await readJson(request);
  const bio = typeof body.bio === "string" ? body.bio.trim() : "";
  const socialUrl = typeof body.socialUrl === "string" ? body.socialUrl.trim() : "";
  if (bio.length > 500) throw new ApiError(400, "invalid_bio");
  if (socialUrl && (!/^https:\/\//i.test(socialUrl) || socialUrl.length > 500)) throw new ApiError(400, "invalid_social_url");
  await enforceContentPolicy(env, user, "profile", [bio, socialUrl]);
  await env.DB.prepare("UPDATE users SET bio=?,social_url=?,updated_at=? WHERE skr_domain=?")
    .bind(bio || null, socialUrl || null, now(), user.skrDomain).run();
  return json({ updated: true });
}

async function deleteAccount(request: Request, env: Env): Promise<Response> {
  const user = await requireSession(request, env);
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET status='deleted',bio=NULL,social_url=NULL,deleted_at=?,updated_at=? WHERE skr_domain=?").bind(timestamp, timestamp, user.skrDomain),
    env.DB.prepare("UPDATE needs SET deleted_at=? WHERE author_skr=? AND deleted_at IS NULL").bind(timestamp, user.skrDomain),
    env.DB.prepare("UPDATE works SET deleted_at=? WHERE author_skr=? AND deleted_at IS NULL").bind(timestamp, user.skrDomain),
    env.DB.prepare("UPDATE comments SET deleted_at=? WHERE author_skr=? AND deleted_at IS NULL").bind(timestamp, user.skrDomain),
    env.DB.prepare("UPDATE messages SET deleted_at=? WHERE sender_skr=? AND deleted_at IS NULL").bind(timestamp, user.skrDomain),
    env.DB.prepare("DELETE FROM reactions WHERE identity_skr=?").bind(user.skrDomain),
    env.DB.prepare("DELETE FROM user_blocks WHERE blocker_skr=? OR blocked_skr=?").bind(user.skrDomain, user.skrDomain),
    env.DB.prepare("UPDATE sessions SET revoked_at=? WHERE skr_domain=? AND revoked_at IS NULL").bind(timestamp, user.skrDomain),
  ]);
  return new Response(null, { status: 204 });
}

async function listBlocks(request: Request, env: Env): Promise<Response> {
  const user = await requireSession(request, env);
  const result = await env.DB.prepare("SELECT blocked_skr,created_at FROM user_blocks WHERE blocker_skr=? ORDER BY created_at DESC").bind(user.skrDomain).all();
  return json({ items: result.results.map((row) => ({ skrDomain: row.blocked_skr, createdAt: row.created_at })) });
}

async function blockUser(skrDomain: string, request: Request, env: Env): Promise<Response> {
  const user = await requireSession(request, env);
  const target = skrDomain.toLowerCase();
  if (target === user.skrDomain) throw new ApiError(400, "cannot_block_self");
  const exists = await env.DB.prepare("SELECT 1 FROM users WHERE skr_domain=? AND status='active'").bind(target).first();
  if (!exists) throw new ApiError(404, "profile_not_found");
  await env.DB.prepare("INSERT INTO user_blocks(blocker_skr,blocked_skr,created_at) VALUES(?,?,?) ON CONFLICT(blocker_skr,blocked_skr) DO NOTHING")
    .bind(user.skrDomain, target, now()).run();
  return json({ blocked: true });
}

async function unblockUser(skrDomain: string, request: Request, env: Env): Promise<Response> {
  const user = await requireSession(request, env);
  await env.DB.prepare("DELETE FROM user_blocks WHERE blocker_skr=? AND blocked_skr=?").bind(user.skrDomain, skrDomain.toLowerCase()).run();
  return new Response(null, { status: 204 });
}

async function notifications(request: Request, env: Env): Promise<Response> {
  const user = await requireSession(request, env);
  const result = await env.DB.prepare("SELECT * FROM notifications WHERE recipient_skr=? ORDER BY created_at DESC LIMIT 100").bind(user.skrDomain).all();
  return json({ items: result.results.map((row) => ({ ...row, payload: safeObject(row.payload_json) })) });
}

async function uploadMedia(request: Request, env: Env): Promise<Response> {
  const user = await requireSession(request, env);
  await consumeRate(env, user.skrDomain, "media", 60, 12);
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  let imageBytes: Uint8Array;
  if (contentType.startsWith("image/webp")) {
    imageBytes = await readBinary(request, MAX_IMAGE_BYTES);
  } else if (contentType.startsWith("multipart/form-data")) {
    const form = await readFormData(request, MAX_MEDIA_BODY_BYTES);
    const file = form.get("file");
    if (!(file instanceof File) || file.type !== "image/webp") throw new ApiError(400, "invalid_image");
    imageBytes = new Uint8Array(await file.arrayBuffer());
  } else {
    throw new ApiError(415, "webp_required");
  }
  if (imageBytes.byteLength <= 0 || imageBytes.byteLength > MAX_IMAGE_BYTES) throw new ApiError(400, "invalid_image");
  const sanitized = sanitizeWebp(imageBytes);
  const key = `uploads/${user.skrDomain}/${crypto.randomUUID()}.webp`;
  try {
    await env.MEDIA.put(key, sanitized, { httpMetadata: { contentType: "image/webp", cacheControl: "public,max-age=31536000,immutable" } });
  } catch (error) {
    console.error("media_storage_write_failed", error instanceof Error ? error.name : "unknown");
    throw new ApiError(503, "media_storage_unavailable");
  }
  return json({ key, url: `/media/${key}` }, 201);
}

async function getMedia(key: string, request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!/^uploads\/[a-z0-9.-]+\.skr\/[a-f0-9-]+\.webp$/.test(key)) throw new ApiError(404, "media_not_found");
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).origin + "/media/" + key, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  const object = await env.MEDIA.get(key);
  if (!object) throw new ApiError(404, "media_not_found");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public,max-age=31536000,immutable");
  const response = new Response(object.body, { headers });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

async function createReport(request: Request, env: Env): Promise<Response> {
  const user = await requireSession(request, env);
  await consumeRate(env, user.skrDomain, "report", 60);
  const body = await readJson(request);
  const targetType = String(body.targetType ?? "");
  if (!new Set(["need", "work", "comment", "profile"]).has(targetType)) throw new ApiError(400, "invalid_target_type");
  const targetId = String(body.targetId ?? "");
  const reason = String(body.reason ?? "").trim();
  const details = String(body.details ?? "").trim();
  if (!targetId || !reason || reason.length > 120 || details.length > 2000) throw new ApiError(400, "invalid_report");
  await assertReportTargetExists(targetType, targetId, env);
  await env.DB.prepare("INSERT INTO reports(id,reporter_skr,target_type,target_id,reason,details,created_at) VALUES(?,?,?,?,?,?,?)")
    .bind(id("report"), user.skrDomain, targetType, targetId, reason, details || null, now()).run();
  return json({ submitted: true }, 201);
}

async function createPromotionOrder(workId: string, request: Request, env: Env): Promise<Response> {
  const user = await requireSession(request, env);
  const work = await env.DB.prepare("SELECT id,promoted_until FROM works WHERE id=? AND author_skr=? AND moderation_status='published' AND deleted_at IS NULL")
    .bind(workId, user.skrDomain).first<{ id: string; promoted_until: string | null }>();
  if (!work) throw new ApiError(404, "published_work_not_found");
  if (work.promoted_until && work.promoted_until > now()) throw new ApiError(409, "promotion_already_active");
  const openOrder = await env.DB.prepare("SELECT id FROM promotion_orders WHERE work_id=? AND buyer_skr=? AND status IN ('quoted','submitted') AND quote_expires_at>?")
    .bind(workId, user.skrDomain, now()).first();
  if (openOrder) throw new ApiError(409, "promotion_order_already_open");
  const price = positiveWholeNumber(await configValue(env, "recommendation_price_skr", env.DEFAULT_RECOMMENDATION_PRICE), "invalid_price_configuration");
  const priceText = String(price);
  const decimals = Number(env.SKR_DECIMALS);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new ApiError(503, "invalid_mint_configuration");
  if (env.SKR_MINT !== CANONICAL_SKR_MINT || env.RECEIVER_ADDRESS !== RECOMMENDATION_RECEIVER) throw new ApiError(503, "invalid_payment_configuration");
  const baseUnits = (BigInt(priceText) * 10n ** BigInt(decimals)).toString();
  const quotedAt = now();
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const orderId = id("promo");
  const network = env.PAYMENT_MODE === "simulation" ? "simulation" : env.ENVIRONMENT;
  if (network === "mainnet-beta" && await configValue(env, "mainnet_payments_enabled", "false") !== "true") throw new ApiError(503, "mainnet_payments_disabled");
  await env.DB.prepare(`INSERT INTO promotion_orders(id,work_id,buyer_skr,wallet_address,network,mint_address,receiver_address,token_amount,base_units,status,quoted_at,quote_expires_at)
    VALUES(?,?,?,?,?,?,?,?,?,'quoted',?,?)`).bind(orderId, workId, user.skrDomain, user.walletAddress, network, env.SKR_MINT,
      env.RECEIVER_ADDRESS, price, baseUnits, quotedAt, expiresAt).run();
  return json({ orderId, network, mintAddress: env.SKR_MINT, receiverAddress: env.RECEIVER_ADDRESS, amountSkr: price, baseUnits, expiresAt });
}

async function simulatePromotion(orderId: string, request: Request, env: Env): Promise<Response> {
  const user = await requireSession(request, env);
  if (env.PAYMENT_MODE !== "simulation" || env.ENVIRONMENT !== "devnet") throw new ApiError(404, "not_found");
  const order = await env.DB.prepare("SELECT * FROM promotion_orders WHERE id=? AND buyer_skr=? AND status='quoted' AND quote_expires_at>?")
    .bind(orderId, user.skrDomain, now()).first<{ work_id: string; buyer_skr: string }>();
  if (!order) throw new ApiError(404, "active_order_not_found");
  const durationDays = positiveWholeNumber(env.RECOMMENDATION_DAYS, "invalid_duration_configuration", 365);
  const starts = now();
  const ends = new Date(Date.now() + durationDays * 86_400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE promotion_orders SET status='confirmed',confirmed_at=?,promotion_starts_at=?,promotion_ends_at=? WHERE id=?")
      .bind(starts, starts, ends, orderId),
    env.DB.prepare("UPDATE works SET promoted_until=? WHERE id=?").bind(ends, order.work_id),
    env.DB.prepare("INSERT INTO notifications(id,recipient_skr,type,payload_json,created_at) VALUES(?,?,?,?,?)")
      .bind(id("notification"), order.buyer_skr, "promotion_started", JSON.stringify({ orderId, workId: order.work_id, endsAt: ends }), starts),
  ]);
  return json({ status: "confirmed", startsAt: starts, endsAt: ends, simulated: true });
}

/** Confirm a real SPL transfer after the wallet has broadcast it. The server never signs or broadcasts. */
async function submitPromotion(orderId: string, request: Request, env: Env): Promise<Response> {
  const user = await requireSession(request, env);
  if (env.PAYMENT_MODE !== "onchain") throw new ApiError(404, "not_found");
  // Recommendation purchase is not wired to the wallet transaction template yet.
  // Never accept a balance delta as proof: it does not bind a payment to this order.
  throw new ApiError(503, "promotion_onchain_not_ready");
}

async function announcements(env: Env): Promise<Response> {
  const result = await env.DB.prepare("SELECT id,title_en,title_zh,body_en,body_zh,pinned,published_at FROM announcements WHERE deleted_at IS NULL ORDER BY pinned DESC,published_at DESC LIMIT 20").all();
  return json({ items: result.results });
}

async function adminRoute(path: string, request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (path.startsWith('/admin/operations/')) return operationsRoute(path, request, env, admin);
  if (request.method === "GET" && path === "/admin/overview") {
    const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const generatedAt = now();
    const [activeUsers, blockedUsers, needs, pendingWorks, publishedWorks, comments, openReports, activePromotions, catalogApps, moderation24h] = await Promise.all([
      adminCount(env, "SELECT COUNT(*) AS value FROM users WHERE status='active'"),
      adminCount(env, "SELECT COUNT(*) AS value FROM users WHERE status='blocked'"),
      adminCount(env, "SELECT COUNT(*) AS value FROM needs WHERE deleted_at IS NULL"),
      adminCount(env, "SELECT COUNT(*) AS value FROM works WHERE deleted_at IS NULL AND moderation_status='pending'"),
      adminCount(env, "SELECT COUNT(*) AS value FROM works WHERE deleted_at IS NULL AND moderation_status='published'"),
      adminCount(env, "SELECT COUNT(*) AS value FROM comments WHERE deleted_at IS NULL"),
      adminCount(env, "SELECT (SELECT COUNT(*) FROM reports WHERE status='open') + (SELECT COUNT(*) FROM message_reports WHERE status='open') AS value"),
      adminCount(env, "SELECT COUNT(*) AS value FROM works WHERE deleted_at IS NULL AND moderation_status='published' AND promoted_until > ?", generatedAt),
      adminCount(env, "SELECT COUNT(*) AS value FROM store_catalog WHERE active=1"),
      adminCount(env, "SELECT COUNT(*) AS value FROM moderation_events WHERE created_at >= ?", since),
    ]);
    return json({
      generatedAt,
      environment: env.ENVIRONMENT,
      paymentMode: env.PAYMENT_MODE,
      metrics: { activeUsers, blockedUsers, needs, pendingWorks, publishedWorks, comments, openReports, activePromotions, catalogApps, moderation24h },
    });
  }
  if (request.method === "GET" && path === "/admin/config") {
    const priceSkr = positiveWholeNumber(await configValue(env, "recommendation_price_skr", env.DEFAULT_RECOMMENDATION_PRICE), "invalid_price_configuration");
    return json({ priceSkr, durationDays: Number(env.RECOMMENDATION_DAYS), environment: env.ENVIRONMENT, paymentMode: env.PAYMENT_MODE });
  }
  if (request.method === "GET" && path === "/admin/needs") {
    const result = await env.DB.prepare("SELECT * FROM needs WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 200").all();
    return json({ items: result.results.map(serializeNeed) });
  }
  if (request.method === "GET" && path === "/admin/works") {
    const focusId = new URL(request.url).searchParams.get('id');
    const result = focusId
      ? await env.DB.prepare("SELECT * FROM works WHERE deleted_at IS NULL AND id=?").bind(focusId).all()
      : await env.DB.prepare("SELECT * FROM works WHERE deleted_at IS NULL ORDER BY moderation_status='pending' DESC,CASE WHEN moderation_status='pending' THEN created_at END ASC,created_at DESC LIMIT 200").all();
    return json({ items: result.results.map((row) => ({ ...serializeWork(row), policy_violation: !isPublicContentAllowed("work", row) })) });
  }
  const reviewId = match(path, /^\/admin\/works\/([^/]+)\/review$/);
  if (reviewId && request.method === "POST") {
    const body = await readJson(request);
    const decision = body.decision === "published" ? "published" : body.decision === "rejected" ? "rejected" : null;
    if (!decision) throw new ApiError(400, "invalid_review_decision");
    const work = await env.DB.prepare("SELECT * FROM works WHERE id=? AND deleted_at IS NULL").bind(reviewId).first<Record<string, unknown>>();
    if (!work) throw new ApiError(404, "work_not_found");
    if (decision === "published") await enforceContentPolicy(env, { skrDomain: String(work.author_skr), walletAddress: "" }, "work", contentFields("work", work));
    const statements = [
      env.DB.prepare("UPDATE works SET moderation_status=?,moderation_note=?,reviewed_at=? WHERE id=? AND deleted_at IS NULL")
        .bind(decision, String(body.note ?? "").slice(0, 1000) || null, now(), reviewId),
      audit(env, admin, "work_review", "work", reviewId, { decision }),
    ];
    if (work) statements.push(
      env.DB.prepare("INSERT INTO notifications(id,recipient_skr,type,payload_json,created_at) VALUES(?,?,?,?,?)")
        .bind(id("notification"), work.author_skr, "work_review", JSON.stringify({ workId: reviewId, decision }), now()),
    );
    await env.DB.batch(statements);
    return json({ status: decision });
  }
  if (request.method === "GET" && path === "/admin/reports") {
    const result = await env.DB.prepare(`SELECT r.*,
      COALESCE(n.title,w.name,substr(c.body,1,160),u.skr_domain,'Unavailable') AS target_label,
      COALESCE(n.author_skr,w.author_skr,c.author_skr,u.skr_domain) AS target_author
      FROM reports r
      LEFT JOIN needs n ON r.target_type='need' AND n.id=r.target_id
      LEFT JOIN works w ON r.target_type='work' AND w.id=r.target_id
      LEFT JOIN comments c ON r.target_type='comment' AND c.id=r.target_id
      LEFT JOIN users u ON r.target_type='profile' AND u.skr_domain=r.target_id
      ORDER BY r.status='open' DESC,CASE WHEN r.status='open' THEN r.created_at END ASC,r.created_at DESC LIMIT 200`).all();
    return json({ items: result.results });
  }
  if (request.method === "GET" && path === "/admin/comments") {
    const result = await env.DB.prepare("SELECT id,author_skr,target_type,target_id,parent_id,body,like_count,created_at FROM comments WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 200").all();
    return json({ items: result.results });
  }
  if (request.method === "GET" && path === "/admin/users") {
    const result = await env.DB.prepare(`SELECT u.skr_domain,u.locale,u.status,u.created_at,u.updated_at,
      (SELECT COUNT(*) FROM needs n WHERE n.author_skr=u.skr_domain AND n.deleted_at IS NULL) AS need_count,
      (SELECT COUNT(*) FROM works w WHERE w.author_skr=u.skr_domain AND w.deleted_at IS NULL) AS work_count,
      (SELECT COUNT(*) FROM comments c WHERE c.author_skr=u.skr_domain AND c.deleted_at IS NULL) AS comment_count
      FROM users u ORDER BY u.created_at DESC LIMIT 200`).all();
    return json({ items: result.results });
  }
  if (request.method === "GET" && path === "/admin/promotions") {
    const result = await env.DB.prepare(`SELECT p.id,p.work_id,w.name AS work_name,p.buyer_skr,p.network,p.token_amount,p.status,p.quoted_at,p.confirmed_at,p.promotion_starts_at,p.promotion_ends_at
      FROM promotion_orders p LEFT JOIN works w ON w.id=p.work_id ORDER BY p.quoted_at DESC LIMIT 200`).all();
    return json({ items: result.results });
  }
  if (request.method === "GET" && path === "/admin/audit") {
    const result = await env.DB.prepare("SELECT id,actor,action,target_type,target_id,detail_json,created_at FROM audit_log ORDER BY created_at DESC LIMIT 200").all();
    return json({ items: result.results });
  }
  if (request.method === "GET" && path === "/admin/announcements") {
    const result = await env.DB.prepare("SELECT id,title_en,title_zh,body_en,body_zh,pinned,published_at FROM announcements WHERE deleted_at IS NULL ORDER BY pinned DESC,published_at DESC LIMIT 100").all();
    return json({ items: result.results });
  }
  if (request.method === "GET" && path === "/admin/store-catalog/status") {
    const row = await env.DB.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) AS active,SUM(CASE WHEN active=1 AND translated_at IS NOT NULL THEN 1 ELSE 0 END) AS translated,SUM(CASE WHEN active=1 AND translated_at IS NULL AND translation_attempts>=3 THEN 1 ELSE 0 END) AS translation_failed,MAX(synced_at) AS last_synced_at,MAX(translated_at) AS last_translated_at,MAX(sync_generation) AS generation FROM store_catalog").first();
    return json({ ...(row ?? { total: 0, active: 0 }), translation_enabled: await configValue(env, "catalog_translation_enabled", "false") === "true", translation_budget: await translationBudgetStatus(env) });
  }
  if (request.method === "GET" && path === "/admin/moderation-events") {
    const result = await env.DB.prepare("SELECT id,identity_skr,surface,category,created_at FROM moderation_events ORDER BY created_at DESC LIMIT 200").all();
    return json({ items: result.results });
  }
  const resolveReportId = match(path, /^\/admin\/reports\/([^/]+)\/resolve$/);
  if (resolveReportId && request.method === "POST") {
    const body = await readJson(request);
    const status = body.dismiss === true ? "dismissed" : "resolved";
    await env.DB.batch([
      env.DB.prepare("UPDATE reports SET status=?,resolved_at=? WHERE id=? AND status='open'").bind(status, now(), resolveReportId),
      audit(env, admin, "report_resolve", "report", resolveReportId, { status }),
    ]);
    return json({ status });
  }
  const moderationTarget = path.match(/^\/admin\/(needs|works|comments)\/([^/]+)\/remove$/);
  if (moderationTarget && request.method === "POST") {
    const table = moderationTarget[1];
    const targetId = moderationTarget[2];
    await env.DB.batch([
      env.DB.prepare(`UPDATE ${table} SET deleted_at=? WHERE id=? AND deleted_at IS NULL`).bind(now(), targetId),
      audit(env, admin, "content_remove", table, targetId, {}),
    ]);
    return json({ removed: true });
  }
  const blockDomain = match(path, /^\/admin\/identities\/([^/]+)\/block$/);
  if (blockDomain && request.method === "POST") {
    if (!/^[a-z0-9.-]+\.skr$/.test(blockDomain)) throw new ApiError(400, "invalid_skr_domain");
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET status='blocked',updated_at=? WHERE skr_domain=?").bind(now(), blockDomain),
      env.DB.prepare("UPDATE sessions SET revoked_at=? WHERE skr_domain=? AND revoked_at IS NULL").bind(now(), blockDomain),
      audit(env, admin, "identity_block", "identity", blockDomain, {}),
    ]);
    return json({ status: "blocked" });
  }
  const unblockDomain = match(path, /^\/admin\/identities\/([^/]+)\/unblock$/);
  if (unblockDomain && request.method === "POST") {
    if (!/^[a-z0-9.-]+\.skr$/.test(unblockDomain)) throw new ApiError(400, "invalid_skr_domain");
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET status='active',updated_at=? WHERE skr_domain=? AND status='blocked'").bind(now(), unblockDomain),
      audit(env, admin, "identity_unblock", "identity", unblockDomain, {}),
    ]);
    return json({ status: "active" });
  }
  if (request.method === "PUT" && path === "/admin/config/recommendation-price") {
    const body = await readJson(request);
    const value = String(body.priceSkr ?? "");
    const price = positiveWholeNumber(value, "positive_integer_required", 2_147_483_647, 400);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO config(key,value,updated_at) VALUES('recommendation_price_skr',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(value, now()),
      audit(env, admin, "price_update", "config", "recommendation_price_skr", { value }),
    ]);
    return json({ priceSkr: price });
  }
  if (request.method === "POST" && path === "/admin/announcements") {
    const body = await readJson(request);
    const announcementId = id("announcement");
    for (const key of ["titleEn", "titleZh", "bodyEn", "bodyZh"]) if (typeof body[key] !== "string" || !String(body[key]).trim()) throw new ApiError(400, `invalid_${key}`);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO announcements(id,title_en,title_zh,body_en,body_zh,pinned,published_at) VALUES(?,?,?,?,?,?,?)")
        .bind(announcementId, body.titleEn, body.titleZh, body.bodyEn, body.bodyZh, body.pinned === true ? 1 : 0, now()),
      audit(env, admin, "announcement_create", "announcement", announcementId, {}),
    ]);
    return json({ id: announcementId }, 201);
  }
  const announcementDeleteId = match(path, /^\/admin\/announcements\/([^/]+)$/);
  if (announcementDeleteId && request.method === "DELETE") {
    await env.DB.batch([
      env.DB.prepare("UPDATE announcements SET deleted_at=? WHERE id=? AND deleted_at IS NULL").bind(now(), announcementDeleteId),
      audit(env, admin, "announcement_delete", "announcement", announcementDeleteId, {}),
    ]);
    return json({ deleted: true });
  }
  if (request.method === "POST" && path === "/admin/store-catalog/sync") {
    const result = await syncStoreCatalog(env);
    await audit(env, admin, "store_catalog_sync", "store_catalog", "official", result);
    return json(result);
  }
  if (request.method === "POST" && path === "/admin/store-catalog/translation-control") {
    const body = await readJson(request);
    if (typeof body.enabled !== "boolean") throw new ApiError(400, "invalid_translation_control");
    const statements = [env.DB.prepare("INSERT INTO config(key,value,updated_at) VALUES('catalog_translation_enabled',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(String(body.enabled), now()), audit(env, admin, "catalog_translation_control", "store_catalog", "official", { enabled: body.enabled, retryFailed: body.retryFailed === true })];
    if (body.retryFailed === true) statements.push(env.DB.prepare("UPDATE store_catalog SET translation_attempts=0,translation_retry_at=NULL WHERE active=1 AND translated_at IS NULL"));
    await env.DB.batch(statements);
    return json({ enabled: body.enabled });
  }
  if (request.method === "POST" && path === "/admin/store-catalog/translate") {
    const result = await translateStoreCatalogBatch(env);
    await audit(env, admin, "store_catalog_translate", "store_catalog", "official", result);
    return json(result);
  }
  throw new ApiError(404, "not_found");
}

async function adminCount(env: Env, sql: string, ...bindings: unknown[]): Promise<number> {
  const statement = env.DB.prepare(sql);
  const row = await (bindings.length ? statement.bind(...bindings) : statement).first<{ value: number }>();
  return Number(row?.value ?? 0);
}

function audit(env: Env, actor: string, action: string, targetType: string, targetId: string, detail: JsonMap): D1PreparedStatement {
  return env.DB.prepare("INSERT INTO audit_log(id,actor,action,target_type,target_id,detail_json,created_at) VALUES(?,?,?,?,?,?,?)")
    .bind(id("audit"), actor, action, targetType, targetId, JSON.stringify(detail), now());
}

async function consumeRate(env: Env, identity: string, action: string, windowSeconds: number, maxHits = 1): Promise<void> {
  const epoch = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(`INSERT INTO rate_limits(identity_skr,action,window_started_at,hits) VALUES(?,?,?,1)
    ON CONFLICT(identity_skr,action) DO UPDATE SET
      hits=CASE WHEN ?-window_started_at < ? THEN hits+1 ELSE 1 END,
      window_started_at=CASE WHEN ?-window_started_at < ? THEN window_started_at ELSE ? END
    RETURNING hits`).bind(identity, action, epoch, epoch, windowSeconds, epoch, windowSeconds, epoch).first<{ hits: number }>();
  if (!row || row.hits > maxHits) throw new ApiError(429, "rate_limited");
}

async function anonymousIdentity(request: Request, env: Env): Promise<string> {
  if (!env.ABUSE_HASH_KEY || env.ABUSE_HASH_KEY.length < 32) throw new ApiError(503, "abuse_protection_unavailable");
  const address = request.headers.get("cf-connecting-ip") ?? "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.ABUSE_HASH_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${day}:${address}`));
  return `anon_${Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function secureResponse(response: Response, cors: Record<string, string>): Response {
  Object.entries(cors).forEach(([key, value]) => response.headers.set(key, value));
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("referrer-policy", "no-referrer");
  response.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
  response.headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  if (!response.headers.has("cache-control")) response.headers.set("cache-control", "no-store");
  return response;
}

async function configValue(env: Env, key: string, fallback: string): Promise<string> {
  return (await env.DB.prepare("SELECT value FROM config WHERE key=?").bind(key).first<{ value: string }>())?.value ?? fallback;
}

function positiveWholeNumber(value: string, errorCode: string, max = 2_147_483_647, status = 503): number {
  if (!/^[1-9]\d*$/.test(value)) throw new ApiError(status, errorCode);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > max) throw new ApiError(status, errorCode);
  return parsed;
}

async function assertTargetExists(targetType: "need" | "work", targetId: string, env: Env): Promise<void> {
  const table = targetType === "need" ? "needs" : "works";
  const extra = targetType === "work" ? " AND moderation_status='published'" : "";
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id=? AND deleted_at IS NULL${extra}`).bind(targetId).first();
  if (!row || !isPublicContentAllowed(targetType, row)) throw new ApiError(404, "target_not_found");
}

async function assertAuthorVisible(request: Request, authorSkr: string, env: Env): Promise<void> {
  const viewer = await optionalSession(request, env);
  if (!viewer) return;
  const blocked = await env.DB.prepare("SELECT 1 FROM user_blocks WHERE blocker_skr=? AND blocked_skr=?")
    .bind(viewer.skrDomain, authorSkr).first();
  if (blocked) throw new ApiError(404, "content_not_found");
}

async function assertReportTargetExists(targetType: string, targetId: string, env: Env): Promise<void> {
  if (targetType === "need" || targetType === "work") return assertTargetExists(targetType, targetId, env);
  if (targetType === "comment") {
    const row = await env.DB.prepare("SELECT id FROM comments WHERE id=? AND deleted_at IS NULL").bind(targetId).first();
    if (!row) throw new ApiError(404, "target_not_found");
    return;
  }
  const profile = await env.DB.prepare("SELECT skr_domain FROM users WHERE skr_domain=? AND status='active'").bind(targetId.toLowerCase()).first();
  if (!profile) throw new ApiError(404, "target_not_found");
}

function serializeNeed(row: Record<string, unknown>) {
  return {
    id: row.id,
    author_skr: row.author_skr,
    title: row.title,
    problem: row.problem,
    solution_idea: row.solution_idea,
    audience: row.audience,
    category: row.category,
    format: row.format ?? "structured",
    tags: parseJsonArray(row.tags_json),
    media: parseJsonArray(row.media_json),
    request_type: row.request_type ?? "free",
    budget_skr: row.budget_skr ?? null,
    need_count: row.need_count,
    comment_count: row.comment_count,
    created_at: row.created_at,
  };
}

function serializeWork(row: Record<string, unknown>) {
  return {
    id: row.id,
    author_skr: row.author_skr,
    name: row.name,
    summary: row.summary,
    description: row.description,
    store_url: row.store_url,
    category: row.category,
    tags: parseJsonArray(row.tags_json),
    icon_key: row.icon_key,
    screenshots: parseJsonArray(row.screenshots_json),
    demo_url: row.demo_url,
    moderation_status: row.moderation_status,
    public_visibility: !isPublicContentAllowed("work", row) ? "hidden_policy" : row.moderation_status === "published" ? "visible" : "not_published",
    like_count: row.like_count,
    comment_count: row.comment_count,
    promoted_until: row.promoted_until,
    created_at: row.created_at,
  };
}

function safeObject(value: unknown): JsonMap {
  if (typeof value !== "string") return {};
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
}

async function assertMediaOwnership(keys: string[], skrDomain: string, env: Env): Promise<void> {
  const prefix = `uploads/${skrDomain}/`;
  if (keys.some((key) => !key.startsWith(prefix))) throw new ApiError(400, "invalid_media_owner");
  const objects = await Promise.all(keys.map((key) => env.MEDIA.head(key)));
  if (objects.some((object) => object === null)) throw new ApiError(400, "invalid_media_reference");
}

async function runRetentionCleanup(env: Env): Promise<void> {
  const timestamp = Date.now();
  const currentTime = new Date(timestamp).toISOString();
  const oneDayAgo = new Date(timestamp - 86_400_000).toISOString();
  const thirtyDaysAgo = new Date(timestamp - 30 * 86_400_000).toISOString();
  const oneHundredEightyDaysAgo = new Date(timestamp - 180 * 86_400_000).toISOString();
  const [deletedNeeds, deletedWorks] = await Promise.all([
    env.DB.prepare("SELECT media_json FROM needs WHERE deleted_at IS NOT NULL AND deleted_at < ? AND media_json != '[]'").bind(thirtyDaysAgo).all<{ media_json: string }>(),
    env.DB.prepare("SELECT icon_key,screenshots_json FROM works WHERE deleted_at IS NOT NULL AND deleted_at < ? AND (icon_key != '' OR screenshots_json != '[]')").bind(thirtyDaysAgo).all<{ icon_key: string; screenshots_json: string }>(),
  ]);
  const mediaKeys = [
    ...deletedNeeds.results.flatMap((row) => parseJsonArray(row.media_json)),
    ...deletedWorks.results.flatMap((row) => [row.icon_key, ...parseJsonArray(row.screenshots_json)]),
  ].filter(Boolean);
  await Promise.all(mediaKeys.map((key) => env.MEDIA.delete(key)));
  const results = await env.DB.batch([
    env.DB.prepare(`DELETE FROM operations_projects WHERE
      (target_type='need' AND EXISTS(SELECT 1 FROM needs n WHERE n.id=target_id AND n.deleted_at IS NOT NULL AND n.deleted_at<?)) OR
      (target_type='work' AND EXISTS(SELECT 1 FROM works w WHERE w.id=target_id AND w.deleted_at IS NOT NULL AND w.deleted_at<?))`).bind(thirtyDaysAgo,thirtyDaysAgo),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ? OR revoked_at IS NOT NULL").bind(currentTime),
    env.DB.prepare("DELETE FROM auth_challenges WHERE expires_at < ? AND NOT EXISTS (SELECT 1 FROM sessions WHERE sessions.challenge_id=auth_challenges.id)").bind(oneDayAgo),
    env.DB.prepare("DELETE FROM rate_limits WHERE window_started_at < ?").bind(Math.floor((timestamp - 86_400_000) / 1000)),
    env.DB.prepare("UPDATE promotion_orders SET status='expired' WHERE status='quoted' AND quote_expires_at < ?").bind(currentTime),
    env.DB.prepare("DELETE FROM notifications WHERE created_at < ?").bind(oneHundredEightyDaysAgo),
    env.DB.prepare("DELETE FROM reports WHERE status != 'open' AND resolved_at < ?").bind(oneHundredEightyDaysAgo),
    env.DB.prepare("DELETE FROM moderation_events WHERE created_at < ?").bind(oneHundredEightyDaysAgo),
    env.DB.prepare("DELETE FROM audit_log WHERE created_at < ?").bind(oneHundredEightyDaysAgo),
    env.DB.prepare("UPDATE needs SET title='[deleted]',problem='',solution_idea='',audience='',tags_json='[]',media_json='[]' WHERE deleted_at IS NOT NULL AND deleted_at < ? AND (title != '[deleted]' OR media_json != '[]')").bind(thirtyDaysAgo),
    env.DB.prepare("UPDATE works SET name='[deleted]',summary='',description='',store_url='',tags_json='[]',icon_key='',screenshots_json='[]',demo_url=NULL,moderation_note=NULL WHERE deleted_at IS NOT NULL AND deleted_at < ? AND (name != '[deleted]' OR icon_key != '' OR screenshots_json != '[]')").bind(thirtyDaysAgo),
    env.DB.prepare("UPDATE messages SET body='' WHERE deleted_at IS NOT NULL AND deleted_at < ? AND NOT EXISTS (SELECT 1 FROM message_reports r WHERE r.message_id=messages.id AND r.status='open')").bind(thirtyDaysAgo),
    env.DB.prepare("DELETE FROM message_reports WHERE status!='open' AND resolved_at<?").bind(oneHundredEightyDaysAgo),
    env.DB.prepare("UPDATE comments SET body='[deleted]' WHERE deleted_at IS NOT NULL AND deleted_at < ? AND body != '[deleted]'").bind(thirtyDaysAgo),
  ]);
  console.log("retention_cleanup", {
    mediaDeleted: mediaKeys.length,
    databaseChanges: results.reduce((sum, result) => sum + (result.meta.changes ?? 0), 0),
  });
}

async function enforceContentPolicy(
  env: Env,
  user: SessionIdentity,
  surface: "need" | "work" | "comment" | "profile" | "message",
  values: readonly string[],
): Promise<void> {
  const violation = await assessContentPolicy(env, values);
  if (!violation) return;
  try {
    await env.DB.prepare("INSERT INTO moderation_events(id,identity_skr,surface,category,created_at) VALUES(?,?,?,?,?)")
      .bind(id("moderation"), user.skrDomain, surface, violation.category, now()).run();
  } catch (error) {
    console.error("moderation_event_write_failed", surface, violation.category, error instanceof Error ? error.message : "unknown");
  }
  throw new ApiError(400, "content_not_allowed");
}
