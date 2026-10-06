import { optionalSession, requireSession } from './auth';
import { ApiError, id, json, now, readJson } from './http';
import { isPublicContentAllowed } from './moderation';
import { needPayload } from './validation';
import { serializeStoreApp } from './store-catalog';
import type { Env, SessionIdentity } from './types';

interface Services {
  moderate(env: Env, user: SessionIdentity, surface: 'need' | 'comment', fields: readonly string[]): Promise<void>;
  rate(env: Env, identity: string, action: string, seconds: number, hits?: number): Promise<void>;
  serializeNeed(row: Record<string, unknown>): unknown;
}

export async function assertCatalogApp(env: Env, packageName: string | null) {
  if (!packageName) return;
  if (!await env.DB.prepare('SELECT 1 FROM store_catalog WHERE android_package=? AND active=1').bind(packageName).first()) throw new ApiError(400, 'invalid_store_app');
}

export async function enrichNeeds(env: Env, rows: Record<string, unknown>[], viewer?: SessionIdentity | null) {
  if (!rows.length) return rows;
  const result = await env.DB.prepare(`SELECT n.id,s.display_name AS app_name,s.icon_url AS app_icon,c.id AS campaign_id,c.reward_units AS campaign_reward_units,c.funding_state AS campaign_funding_state,c.status AS campaign_status,
    (SELECT COUNT(*) FROM need_followers f JOIN users u ON u.skr_domain=f.identity_skr WHERE f.need_id=n.id AND u.status='active') AS follower_count,
    (SELECT COUNT(*) FROM need_followers f JOIN users u ON u.skr_domain=f.identity_skr WHERE f.need_id=n.id AND f.wants_test=1 AND u.status='active') AS tester_count,
    EXISTS(SELECT 1 FROM need_followers WHERE need_id=n.id AND identity_skr=?) AS following,
    COALESCE((SELECT wants_test FROM need_followers WHERE need_id=n.id AND identity_skr=?),0) AS wants_test
    FROM needs n LEFT JOIN store_catalog s ON s.android_package=n.store_package LEFT JOIN testing_campaigns c ON c.post_id=n.id WHERE n.id IN (${rows.map(() => '?').join(',')})`)
    .bind(viewer?.skrDomain ?? '', viewer?.skrDomain ?? '', ...rows.map(row => row.id)).all<Record<string, unknown>>();
  const extra = new Map(result.results.map(row => [row.id, row]));
  return rows.map(row => ({ ...row, ...extra.get(row.id) }));
}

export async function visibleNeed(env: Env, needId: string, viewer?: SessionIdentity | null) {
  const row = await env.DB.prepare("SELECT n.* FROM needs n JOIN users u ON u.skr_domain=n.author_skr WHERE n.id=? AND n.deleted_at IS NULL AND u.status='active'").bind(needId).first<Record<string, unknown>>();
  if (!row || !isPublicContentAllowed('need', row)) throw new ApiError(404, 'content_not_found');
  if (viewer && await env.DB.prepare('SELECT 1 FROM user_blocks WHERE blocker_skr=? AND blocked_skr=?').bind(viewer.skrDomain, row.author_skr).first()) throw new ApiError(404, 'content_not_found');
  return row;
}

export function needNotification(env: Env, needId: string, actor: string, type: string, payload: Record<string, unknown>, eventId?: string) {
  // Followers and the author receive one event each; block preferences apply both ways.
  return env.DB.prepare(`INSERT INTO notifications(id,recipient_skr,type,payload_json,created_at)
    SELECT ? || ':' || recipient,recipient,?,?,? FROM (
      SELECT author_skr AS recipient FROM needs WHERE id=? UNION SELECT identity_skr FROM need_followers WHERE need_id=?
    ) JOIN users u ON u.skr_domain=recipient WHERE u.status='active' AND recipient!=?
    AND NOT EXISTS(SELECT 1 FROM user_blocks WHERE (blocker_skr=recipient AND blocked_skr=?) OR (blocker_skr=? AND blocked_skr=recipient))
    ${eventId ? 'AND EXISTS(SELECT 1 FROM needs WHERE id=? AND last_event_id=?)' : ''}`)
    .bind(id('notification'), type, JSON.stringify({ ...payload, targetType: 'need', targetId: needId }), now(), needId, needId, actor, actor, actor, ...(eventId ? [needId, eventId] : []));
}

export async function responsePayload(env: Env, body: Record<string, unknown>, targetType: string, viewer: SessionIdentity) {
  const responseKind = body.responseKind ?? 'discussion';
  if (!['discussion','clarification','suggestion','progress','testing'].includes(String(responseKind))) throw new ApiError(400, 'invalid_response_kind');
  const linkedStorePackage = body.linkedStorePackage ?? null;
  const linkedWorkId = body.linkedWorkId ?? null;
  if (linkedStorePackage !== null && (typeof linkedStorePackage !== 'string' || linkedStorePackage.length > 200)) throw new ApiError(400, 'invalid_store_app');
  if (linkedWorkId !== null && (typeof linkedWorkId !== 'string' || linkedWorkId.length > 80)) throw new ApiError(400, 'invalid_work_reference');
  if (targetType !== 'need' && (responseKind !== 'discussion' || linkedStorePackage || linkedWorkId)) throw new ApiError(400, 'invalid_response_kind');
  await assertCatalogApp(env, linkedStorePackage as string | null);
  if (linkedWorkId) {
    const work = await env.DB.prepare(`SELECT w.* FROM works w JOIN users u ON u.skr_domain=w.author_skr
      WHERE w.id=? AND w.deleted_at IS NULL AND w.moderation_status='published' AND u.status='active'
      AND NOT EXISTS(SELECT 1 FROM user_blocks WHERE blocker_skr=? AND blocked_skr=w.author_skr)`)
      .bind(linkedWorkId,viewer.skrDomain).first<Record<string, unknown>>();
    if (!work || !isPublicContentAllowed('work', work)) throw new ApiError(400, 'invalid_work_reference');
  }
  return { responseKind, linkedStorePackage, linkedWorkId };
}

export async function communityRoute(path: string, request: Request, env: Env, services: Services): Promise<Response | null> {
  const url = new URL(request.url);
  if (path === '/v1/following-apps' && request.method === 'GET') {
    const user = await requireSession(request,env);
    const rows = await env.DB.prepare('SELECT s.* FROM store_catalog s JOIN app_followers f ON f.store_package=s.android_package WHERE f.identity_skr=? AND s.active=1 ORDER BY f.created_at DESC LIMIT 100').bind(user.skrDomain).all();
    return json({ items: rows.results.map(serializeStoreApp) });
  }
  const appFollow = path.match(/^\/v1\/store-apps\/([^/]+)\/follow$/);
  if (appFollow) {
    const user = await requireSession(request,env);
    const packageName = decodeURIComponent(appFollow[1]);
    if (request.method === 'GET') return json({ following: Boolean(await env.DB.prepare('SELECT 1 FROM app_followers WHERE store_package=? AND identity_skr=?').bind(packageName,user.skrDomain).first()) });
    await assertCatalogApp(env,packageName);
    if (request.method === 'PUT') {
      await services.rate(env,user.skrDomain,'app_follow',1);
      await env.DB.prepare('INSERT INTO app_followers(store_package,identity_skr,created_at) VALUES(?,?,?) ON CONFLICT DO NOTHING').bind(packageName,user.skrDomain,now()).run();
    } else if (request.method === 'DELETE') await env.DB.prepare('DELETE FROM app_followers WHERE store_package=? AND identity_skr=?').bind(packageName,user.skrDomain).run();
    else throw new ApiError(405,'method_not_allowed');
    return json({ updated: true });
  }
  if (path === '/v1/discover' && request.method === 'GET') {
    const viewer = await optionalSession(request, env);
    const hidden = viewer ? 'AND author_skr NOT IN (SELECT blocked_skr FROM user_blocks WHERE blocker_skr=?)' : '';
    const section = async (where: string, order: string) => {
      const rows = await env.DB.prepare(`SELECT * FROM needs WHERE deleted_at IS NULL AND ${where} ${hidden}
        AND NOT EXISTS(SELECT 1 FROM testing_campaigns c WHERE c.post_id=needs.id AND (c.status!='open' OR c.deadline<=?)) ORDER BY ${order} LIMIT 20`).bind(...(viewer ? [viewer.skrDomain] : []),now()).all<Record<string, unknown>>();
      return (await enrichNeeds(env, rows.results.filter(row => isPublicContentAllowed('need', row)), viewer)).map(services.serializeNeed);
    };
    const [testing, resolved, feedback, popular] = await Promise.all([
      section("status='testing'", 'updated_at DESC,created_at DESC'), section("status='resolved'", 'updated_at DESC,created_at DESC'),
      section("kind='feedback'", 'created_at DESC'), section("kind='need' AND status NOT IN ('resolved','unresolved')", 'need_count DESC,created_at DESC'),
    ]);
    return json({ testing, resolved, feedback, popular });
  }
  if (path === '/v1/following' && request.method === 'GET') {
    const user = await requireSession(request, env);
    const rows = await env.DB.prepare(`SELECT n.* FROM needs n JOIN need_followers f ON f.need_id=n.id
      WHERE f.identity_skr=? AND n.deleted_at IS NULL AND n.author_skr NOT IN (SELECT blocked_skr FROM user_blocks WHERE blocker_skr=?) ORDER BY f.created_at DESC LIMIT 100`)
      .bind(user.skrDomain, user.skrDomain).all<Record<string, unknown>>();
    return json({ items: (await enrichNeeds(env, rows.results.filter(row => isPublicContentAllowed('need', row)), user)).map(services.serializeNeed) });
  }
  const appFeedback = path.match(/^\/v1\/store-apps\/([^/]+)\/feedback$/);
  if (appFeedback && request.method === 'GET') {
    const viewer = await optionalSession(request, env);
    const rows = await env.DB.prepare(`SELECT * FROM needs WHERE store_package=? AND kind='feedback' AND deleted_at IS NULL
      ${viewer ? 'AND author_skr NOT IN (SELECT blocked_skr FROM user_blocks WHERE blocker_skr=?)' : ''} ORDER BY created_at DESC LIMIT 100`)
      .bind(decodeURIComponent(appFeedback[1]), ...(viewer ? [viewer.skrDomain] : [])).all<Record<string, unknown>>();
    return json({ items: (await enrichNeeds(env, rows.results.filter(row => isPublicContentAllowed('need', row)), viewer)).map(services.serializeNeed) });
  }
  const notification = path.match(/^\/v1\/notifications\/([^/]+)\/read$/);
  if (notification && request.method === 'POST') {
    const user = await requireSession(request, env);
    const result = await env.DB.prepare('UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND recipient_skr=?').bind(now(), decodeURIComponent(notification[1]), user.skrDomain).run();
    if (!result.meta.changes) throw new ApiError(404, 'notification_not_found');
    return json({ updated: true });
  }
  const match = path.match(/^\/v1\/needs\/([^/]+)(?:\/(follow|progress))?$/);
  if (!match || !['PUT','POST','DELETE'].includes(request.method)) return null;
  const [, needId, action] = match;
  if (!action && request.method !== 'PUT') return null;
  const user = await requireSession(request, env);
  const row = await visibleNeed(env, needId, user);
  if (action === 'follow') {
    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM need_followers WHERE need_id=? AND identity_skr=?').bind(needId, user.skrDomain).run();
    } else if (request.method === 'PUT') {
      const body = await readJson(request);
      if (typeof body.wantsTest !== 'boolean') throw new ApiError(400, 'invalid_test_preference');
      if(body.wantsTest && await env.DB.prepare('SELECT 1 FROM testing_campaigns WHERE post_id=?').bind(needId).first()) throw new ApiError(400,'testing_campaign_join_required');
      await services.rate(env, user.skrDomain, 'follow', 1);
      await env.DB.prepare(`INSERT INTO need_followers(need_id,identity_skr,wants_test,created_at) VALUES(?,?,?,?)
        ON CONFLICT(need_id,identity_skr) DO UPDATE SET wants_test=excluded.wants_test`).bind(needId, user.skrDomain, body.wantsTest ? 1 : 0, now()).run();
    } else throw new ApiError(405, 'method_not_allowed');
    return json({ updated: true });
  }
  if (row.author_skr !== user.skrDomain) throw new ApiError(403, 'not_content_owner');
  if(await env.DB.prepare('SELECT 1 FROM testing_campaigns WHERE post_id=?').bind(needId).first()) throw new ApiError(409,'campaign_post_rules_locked');
  const body = await readJson(request);
  if (!Number.isSafeInteger(body.revision) || body.revision !== row.revision) throw new ApiError(409, 'revision_conflict');
  await services.rate(env, user.skrDomain, 'need_update', 5);
  const eventId = id('event');
  const timestamp = now();
  if (!action) {
    const payload = needPayload(body);
    await assertCatalogApp(env, payload.storePackage);
    await services.moderate(env, user, 'need', [payload.title, payload.problem, payload.solutionIdea, payload.audience, ...payload.tags]);
    // A changed question needs a fresh outcome; previous discussion remains visible.
    const result = await env.DB.batch([
      env.DB.prepare(`UPDATE needs SET title=?,problem=?,solution_idea=?,audience=?,category=?,tags_json=?,format=?,request_type=?,budget_skr=?,kind=?,feedback_type=?,store_package=?,status='open',revision=revision+1,updated_at=?,last_event_id=?
        WHERE id=? AND author_skr=? AND revision=? AND deleted_at IS NULL`).bind(payload.title,payload.problem,payload.solutionIdea,payload.audience,payload.category,JSON.stringify(payload.tags),payload.format,payload.requestType,payload.budgetSkr,payload.kind,payload.feedbackType,payload.storePackage,timestamp,eventId,needId,user.skrDomain,body.revision),
      env.DB.prepare(`INSERT INTO need_revisions(id,need_id,revision,content_json,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM needs WHERE id=? AND last_event_id=?)`)
        .bind(eventId,needId,body.revision,JSON.stringify(row),timestamp,needId,eventId),
      needNotification(env,needId,user.skrDomain,'need_edited',{ title: payload.title, actor: user.skrDomain },eventId),
    ]);
    if (!result[0].meta.changes) throw new ApiError(409, 'revision_conflict');
  } else if (action === 'progress' && request.method === 'POST') {
    if (!['open','needs_info','suggested','testing','resolved','unresolved'].includes(String(body.status))) throw new ApiError(400, 'invalid_need_status');
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    if (!text || text.length > 2000) throw new ApiError(400, 'invalid_comment');
    const links = await responsePayload(env, { ...body, responseKind: 'progress' }, 'need', user);
    await services.moderate(env,user,'comment',[text]);
    const result = await env.DB.batch([
      env.DB.prepare(`UPDATE needs SET status=?,revision=revision+1,updated_at=?,last_event_id=? WHERE id=? AND author_skr=? AND revision=? AND deleted_at IS NULL`)
        .bind(body.status,timestamp,eventId,needId,user.skrDomain,body.revision),
      env.DB.prepare(`INSERT INTO comments(id,author_skr,target_type,target_id,body,created_at,response_kind,linked_store_package,linked_work_id,outcome_status)
        SELECT ?,?,'need',?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM needs WHERE id=? AND last_event_id=?)`)
        .bind(eventId,user.skrDomain,needId,text,timestamp,['resolved','unresolved'].includes(String(body.status)) ? 'outcome' : 'progress',links.linkedStorePackage,links.linkedWorkId,body.status,needId,eventId),
      needNotification(env,needId,user.skrDomain,'need_progress',{ title: row.title, actor: user.skrDomain, status: body.status },eventId),
    ]);
    if (!result[0].meta.changes) throw new ApiError(409,'revision_conflict');
  } else throw new ApiError(405,'method_not_allowed');
  return json({ updated: true });
}
