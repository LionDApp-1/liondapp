import { requireSession } from "./auth";
import { requireAdmin } from "./admin";
import { ApiError, id, json, now, readJson } from "./http";
import { isPublicContentAllowed } from "./moderation";
import type { Env, SessionIdentity } from "./types";

interface ChatServices {
  moderate(env: Env, user: SessionIdentity, surface: "message", values: readonly string[]): Promise<void>;
  rate(env: Env, identity: string, action: string, seconds: number, hits?: number): Promise<void>;
}
interface Conversation { id: string; need_id: string; owner_skr: string; developer_skr: string }

async function member(env: Env, conversationId: string, user: SessionIdentity) {
  const row = await env.DB.prepare("SELECT * FROM conversations WHERE id=? AND (owner_skr=? OR developer_skr=?)")
    .bind(conversationId, user.skrDomain, user.skrDomain).first<Conversation>();
  if (!row) throw new ApiError(404, "conversation_not_found");
  return row;
}

async function canContact(env: Env, user: string, peer: string) {
  const active = await env.DB.prepare("SELECT 1 FROM users WHERE skr_domain=? AND status='active'").bind(peer).first();
  const blocked = await env.DB.prepare("SELECT 1 FROM user_blocks WHERE (blocker_skr=? AND blocked_skr=?) OR (blocker_skr=? AND blocked_skr=?)")
    .bind(user, peer, peer, user).first();
  if (!active || blocked) throw new ApiError(403, "conversation_unavailable");
}

function cursor(value: string | null) {
  if (value === null) return Number.MAX_SAFE_INTEGER;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new ApiError(400, "invalid_cursor");
  return Number(value);
}

export async function chatRoute(path: string, request: Request, env: Env, services: ChatServices): Promise<Response> {
  if (path.startsWith("/admin/")) {
    const admin = await requireAdmin(request, env);
    if (path === "/admin/message-reports" && request.method === "GET") {
      const rows = await env.DB.prepare(`SELECT r.*,m.sender_skr,m.body,m.deleted_at FROM message_reports r
        JOIN messages m ON m.id=r.message_id ORDER BY r.status='open' DESC,r.created_at DESC LIMIT 100`).all();
      return json({ items: rows.results });
    }
    const reportId = path.match(/^\/admin\/message-reports\/([^/]+)$/)?.[1];
    if (reportId && request.method === "POST") {
      const body = await readJson(request);
      if (body.decision !== "removed" && body.decision !== "dismissed") throw new ApiError(400, "invalid_review_decision");
      const report = await env.DB.prepare("SELECT message_id FROM message_reports WHERE id=? AND status='open'").bind(reportId).first<{message_id: string}>();
      if (!report) throw new ApiError(404, "report_not_found");
      const statements = [env.DB.prepare("UPDATE message_reports SET status=?,resolved_at=? WHERE message_id=? AND status='open'").bind(body.decision, now(), report.message_id)];
      if (body.decision === "removed") statements.push(env.DB.prepare("UPDATE messages SET deleted_at=COALESCE(deleted_at,?) WHERE id=?").bind(now(), report.message_id));
      statements.push(env.DB.prepare("INSERT INTO audit_log(id,actor,action,target_type,target_id,detail_json,created_at) VALUES(?,?,?,?,?,?,?)")
        .bind(id("audit"), admin, "message_review", "message", report.message_id, JSON.stringify({ decision: body.decision }), now()));
      await env.DB.batch(statements);
      return json({ updated: true });
    }
    throw new ApiError(404, "not_found");
  }
  const user = await requireSession(request, env);
  if (path === "/v1/conversations" && request.method === "POST") {
    const body = await readJson(request);
    const need = await env.DB.prepare("SELECT * FROM needs WHERE id=? AND deleted_at IS NULL").bind(String(body.needId ?? "")).first<Record<string, unknown>>();
    if (!need || !isPublicContentAllowed("need", need)) throw new ApiError(404, "need_not_found");
    const owner = String(need.author_skr);
    if (owner === user.skrDomain) throw new ApiError(400, "cannot_contact_self");
    await canContact(env, user.skrDomain, owner);
    const existing = await env.DB.prepare("SELECT id FROM conversations WHERE need_id=? AND developer_skr=?").bind(need.id, user.skrDomain).first();
    if (existing) return json(existing);
    await services.rate(env, user.skrDomain, "conversation_create", 60, 5);
    await env.DB.prepare("INSERT INTO conversations(id,need_id,owner_skr,developer_skr,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(need_id,developer_skr) DO NOTHING")
      .bind(id("chat"), need.id, owner, user.skrDomain, now(), now()).run();
    return json(await env.DB.prepare("SELECT id FROM conversations WHERE need_id=? AND developer_skr=?").bind(need.id, user.skrDomain).first(), 201);
  }
  if (path === "/v1/conversations" && request.method === "GET") {
    const before = new URL(request.url).searchParams.get("before");
    const parts = before?.split("|");
    if (parts && (parts.length !== 2 || !Number.isFinite(Date.parse(parts[0])))) throw new ApiError(400, "invalid_cursor");
    const rows = await env.DB.prepare(`SELECT c.id,c.need_id,CASE WHEN n.deleted_at IS NULL THEN n.title ELSE '[deleted]' END AS title,
      CASE WHEN c.owner_skr=? THEN c.developer_skr ELSE c.owner_skr END AS peer_skr,c.updated_at,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id AND m.sender_skr!=? AND m.deleted_at IS NULL
        AND m.seq>COALESCE((SELECT last_seq FROM conversation_reads WHERE conversation_id=c.id AND reader_skr=?),0)) AS unread_count
      FROM conversations c JOIN needs n ON n.id=c.need_id WHERE (c.owner_skr=? OR c.developer_skr=?)
      AND (? IS NULL OR c.updated_at<? OR (c.updated_at=? AND c.id<?)) ORDER BY c.updated_at DESC,c.id DESC LIMIT 51`)
      .bind(user.skrDomain, user.skrDomain, user.skrDomain, user.skrDomain, user.skrDomain, before, parts?.[0] ?? null, parts?.[0] ?? null, parts?.[1] ?? null).all();
    const items = rows.results.slice(0, 50);
    return json({ items, nextCursor: rows.results.length > 50 ? `${items.at(-1)?.updated_at}|${items.at(-1)?.id}` : null });
  }
  const match = path.match(/^\/v1\/conversations\/([^/]+)\/(messages|read)(?:\/([^/]+)(?:\/(report))?)?$/);
  if (!match) throw new ApiError(404, "not_found");
  const [, conversationId, action, messageId, reportAction] = match;
  const conversation = await member(env, conversationId, user);
  if (action === "read" && request.method === "POST") {
    const body = await readJson(request);
    if (!Number.isSafeInteger(body.lastSeq) || Number(body.lastSeq) < 1) throw new ApiError(400, "invalid_cursor");
    const message = await env.DB.prepare("SELECT 1 FROM messages WHERE conversation_id=? AND seq=?").bind(conversationId, body.lastSeq).first();
    if (!message) throw new ApiError(400, "invalid_cursor");
    await env.DB.prepare(`INSERT INTO conversation_reads(conversation_id,reader_skr,last_seq) VALUES(?,?,?)
      ON CONFLICT(conversation_id,reader_skr) DO UPDATE SET last_seq=MAX(last_seq,excluded.last_seq)`).bind(conversationId, user.skrDomain, body.lastSeq).run();
    return json({ updated: true });
  }
  if (!messageId && action === "messages" && request.method === "GET") {
    const rows = await env.DB.prepare(`SELECT id,seq,sender_skr,CASE WHEN deleted_at IS NULL THEN body ELSE '' END AS body,created_at,deleted_at
      FROM messages WHERE conversation_id=? AND seq<? ORDER BY seq DESC LIMIT 51`)
      .bind(conversationId, cursor(new URL(request.url).searchParams.get("before"))).all();
    const items = rows.results.slice(0, 50);
    return json({ items: items.reverse(), nextCursor: rows.results.length > 50 ? items[0].seq : null });
  }
  if (!messageId && action === "messages" && request.method === "POST") {
    const body = await readJson(request);
    if (typeof body.body !== "string" || !body.body.trim() || body.body.trim().length > 2000) throw new ApiError(400, "invalid_message");
    if (typeof body.clientId !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(body.clientId)) throw new ApiError(400, "invalid_client_id");
    const existing = await env.DB.prepare("SELECT id,conversation_id,body FROM messages WHERE sender_skr=? AND client_id=?").bind(user.skrDomain, body.clientId).first<{ id: string; conversation_id: string; body: string }>();
    if (existing) {
      if (existing.conversation_id !== conversationId || existing.body !== body.body.trim()) throw new ApiError(409, "message_retry_conflict");
      return json({ id: existing.id });
    }
    const peer = conversation.owner_skr === user.skrDomain ? conversation.developer_skr : conversation.owner_skr;
    await canContact(env, user.skrDomain, peer);
    await services.rate(env, user.skrDomain, "message_send", 60, 20);
    await services.moderate(env, user, "message", [body.body.trim()]);
    // Recheck after moderation, which can take long enough for a block to arrive.
    await canContact(env, user.skrDomain, peer);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO messages(id,conversation_id,sender_skr,client_id,body,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(sender_skr,client_id) DO NOTHING")
        .bind(id("msg"), conversationId, user.skrDomain, body.clientId, body.body.trim(), now()),
      env.DB.prepare("UPDATE conversations SET updated_at=? WHERE id=?").bind(now(), conversationId),
    ]);
    const saved = await env.DB.prepare("SELECT id,conversation_id,body FROM messages WHERE sender_skr=? AND client_id=?").bind(user.skrDomain, body.clientId).first<{ id: string; conversation_id: string; body: string }>();
    if (!saved || saved.conversation_id !== conversationId || saved.body !== body.body.trim()) throw new ApiError(409, "message_retry_conflict");
    return json({ id: saved.id }, 201);
  }
  if (messageId && action === "messages") {
    const message = await env.DB.prepare("SELECT id,sender_skr FROM messages WHERE id=? AND conversation_id=?").bind(messageId, conversationId).first<{ id: string; sender_skr: string }>();
    if (!message) throw new ApiError(404, "message_not_found");
    if (!reportAction && request.method === "DELETE") {
      if (message.sender_skr !== user.skrDomain) throw new ApiError(403, "message_not_owned");
      await env.DB.prepare("UPDATE messages SET deleted_at=COALESCE(deleted_at,?) WHERE id=?").bind(now(), messageId).run();
      return new Response(null, { status: 204 });
    }
    if (reportAction && request.method === "POST") {
      const body = await readJson(request);
      if (message.sender_skr === user.skrDomain) throw new ApiError(400, "cannot_report_self");
      if (typeof body.reason !== "string" || !body.reason.trim() || body.reason.trim().length > 500) throw new ApiError(400, "invalid_report");
      await services.rate(env, user.skrDomain, "message_report", 60, 5);
      await env.DB.prepare("INSERT INTO message_reports(id,message_id,reporter_skr,reason,created_at) VALUES(?,?,?,?,?) ON CONFLICT(message_id,reporter_skr) DO NOTHING")
        .bind(id("report"), messageId, user.skrDomain, body.reason.trim(), now()).run();
      return json({ submitted: true }, 201);
    }
  }
  throw new ApiError(404, "not_found");
}
