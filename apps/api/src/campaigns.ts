import { optionalSession, requireSession } from './auth';
import { assertCatalogApp } from './community';
import { ApiError, id, json, now, readJson } from './http';
import { sha256 } from './crypto';
import type { Env, SessionIdentity } from './types';
import { requireAdmin } from './admin';

interface Services {
  moderate(env: Env, user: SessionIdentity, surface: 'need' | 'comment', fields: readonly string[]): Promise<void>;
  rate(env: Env, identity: string, action: string, seconds: number, hits?: number): Promise<void>;
}
type Row = Record<string, any>;
const APPEAL_MS = 3 * 86400_000;
export const SKR_SCALE = 1_000_000n;

export function campaignAmount(value: unknown): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,5})(\.\d{1,6})?$/.test(value)) throw new ApiError(400, 'invalid_reward');
  const [whole, fraction = ''] = value.split('.');
  const units = BigInt(whole) * SKR_SCALE + BigInt(fraction.padEnd(6, '0'));
  if (units > 100_000n * SKR_SCALE) throw new ApiError(400, 'invalid_reward');
  return units;
}
export function rewardFee(units: bigint) { return (units + 9n) / 10n; }
export function effectiveCharacters(value: string) { return [...value.normalize('NFC').replace(/[\s\p{Cf}\p{Cc}]/gu, '')].length; }
export function campaignMode(env: Env) {
  // Simulation must be explicitly enabled and can never select Mainnet funds.
  if (env.BOUNTY_MODE === 'simulation' && env.ENVIRONMENT === 'devnet' && env.PAYMENT_MODE === 'simulation') return 'simulation';
  return 'disabled';
}
function text(body: Row, key: string, max: number) {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new ApiError(400, 'invalid_campaign_' + key);
  return value.trim();
}
function integer(body: Row, key: string, min: number, max: number) {
  if (!Number.isSafeInteger(body[key]) || body[key] < min || body[key] > max) throw new ApiError(400, 'invalid_campaign_' + key);
  return body[key] as number;
}
function event(env: Env, campaign: string, entry: string | null, actor: string, action: string, details: Row, timestamp: string) {
  return env.DB.prepare('INSERT INTO testing_events VALUES(?,?,?,?,?,?,?)').bind(id('testing_event'), campaign, entry, actor, action, JSON.stringify(details), timestamp);
}
async function campaign(env: Env, campaignId: string, viewer?: SessionIdentity | null) {
  const row = await env.DB.prepare('SELECT c.*,s.display_name AS app_name,s.icon_url AS app_icon,u.status AS creator_status FROM testing_campaigns c JOIN store_catalog s ON s.android_package=c.store_package JOIN users u ON u.skr_domain=c.creator_skr WHERE c.id=?').bind(campaignId).first<Row>();
  if (!row || row.funding_state === 'unfunded' && viewer?.skrDomain !== row.creator_skr) throw new ApiError(404, 'campaign_not_found');
  const enrolled = viewer && await env.DB.prepare('SELECT 1 FROM testing_entries WHERE campaign_id=? AND tester_wallet=?').bind(campaignId,viewer.walletAddress).first();
  if(row.creator_status !== 'active' && viewer?.skrDomain !== row.creator_skr && !enrolled) throw new ApiError(404,'campaign_not_found');
  if(row.post_id && viewer?.skrDomain!==row.creator_skr && !enrolled && !await env.DB.prepare('SELECT 1 FROM needs WHERE id=? AND deleted_at IS NULL').bind(row.post_id).first()) throw new ApiError(404,'campaign_not_found');
  if (viewer && !enrolled && await env.DB.prepare('SELECT 1 FROM user_blocks WHERE (blocker_skr=? AND blocked_skr=?) OR (blocker_skr=? AND blocked_skr=?)').bind(viewer.skrDomain, row.creator_skr, row.creator_skr, viewer.skrDomain).first()) throw new ApiError(404, 'campaign_not_found');
  return row;
}
async function expireReservations(env: Env, campaignId: string, timestamp: string) {
  await env.DB.prepare("UPDATE testing_entries SET status='expired',revision=revision+1 WHERE campaign_id=? AND status IN ('reserved','changes_requested') AND submit_by<=?").bind(campaignId, timestamp).run();
}
const HELD = "status NOT IN ('expired','withdrawn') AND NOT(status='rejected' AND appeal_by<=?)";
async function serialize(env: Env, row: Row, viewer?: SessionIdentity | null) {
  const timestamp = now();
  await expireReservations(env, row.id, timestamp);
  const counts = await env.DB.prepare(`SELECT COUNT(*) AS entries,COALESCE(SUM(${HELD}),0) AS occupied,COALESCE(SUM(status IN ('approved','paid')),0) AS approved,COALESCE(SUM(status='paid'),0) AS paid,COALESCE(SUM(status IN ('submitted','changes_requested','disputed')),0) AS pending FROM testing_entries WHERE campaign_id=?`).bind(timestamp, row.id).first<Row>();
  const ownEntry = viewer ? await env.DB.prepare('SELECT * FROM testing_entries WHERE campaign_id=? AND tester_wallet=?').bind(row.id, viewer.walletAddress).first<Row>() : null;
  const { creator_wallet, creator_status, funding_signature, ...publicRow } = row;
  const perSlot = BigInt(row.reward_units) + BigInt(row.fee_units);
  const locked = row.funding_state === 'unfunded' ? 0n : perSlot * BigInt(Number(counts?.occupied ?? 0) - Number(counts?.paid ?? 0));
  const refundable = row.funding_state === 'unfunded' ? 0n : BigInt(row.total_units) - perSlot * BigInt(Number(counts?.paid ?? 0)) - locked - BigInt(row.refunded_units);
  return { ...publicRow, fee_bps: 1000, ...counts, remaining: Math.max(0, row.capacity - Number(counts?.occupied ?? 0)), own_entry: ownEntry, funding_signature: funding_signature ?? null,
    reward_pool_units: (BigInt(row.reward_units)*BigInt(row.capacity)).toString(), locked_units: locked.toString(), refundable_units: refundable.toString(), fee_paid_units: (BigInt(row.fee_units)*BigInt(Number(counts?.paid ?? 0))).toString() };
}
async function entryFor(env: Env, entryId: string, user: SessionIdentity) {
  const entry = await env.DB.prepare('SELECT * FROM testing_entries WHERE id=?').bind(entryId).first<Row>();
  if (!entry) throw new ApiError(404, 'entry_not_found');
  const parent = await campaign(env, entry.campaign_id, user);
  if (entry.tester_wallet !== user.walletAddress && parent.creator_skr !== user.skrDomain) throw new ApiError(404, 'entry_not_found');
  return { entry, parent };
}

async function validateCampaign(env: Env, user: SessionIdentity, body: Row, services: Services) {
    const title = text(body,'title',120), description = text(body,'description',5000), appVersion = text(body,'appVersion',80), requirements = text(body,'requirements',3000), storePackage = text(body,'storePackage',200);
    const capacity = integer(body,'capacity',1,1000), minCharacters = integer(body,'minCharacters',20,2000), reservationHours = integer(body,'reservationHours',1,72);
    const reward = campaignAmount(body.rewardSkr), fee = rewardFee(reward), total = (reward + fee) * BigInt(capacity);
    const deadline = typeof body.deadline === 'string' ? Date.parse(body.deadline) : NaN;
    if (!Number.isFinite(deadline) || deadline < Date.now()+3600_000 || deadline > Date.now()+30*86400_000) throw new ApiError(400,'invalid_campaign_deadline');
    await assertCatalogApp(env,storePackage);
    await services.moderate(env,user,'need',[title,description,requirements,appVersion]);
    const rulesHash = await sha256(JSON.stringify({storePackage,appVersion,requirements,minCharacters,capacity,reservationHours,reward:reward.toString(),fee:fee.toString(),deadline:new Date(deadline).toISOString()}));
    return {title,description,appVersion,requirements,storePackage,capacity,minCharacters,reservationHours,reward,fee,total,deadline,rulesHash};
}

export async function campaignsRoute(path: string, request: Request, env: Env, services: Services): Promise<Response> {
  const url = new URL(request.url);
  if (path.startsWith('/admin/testing-')) return testingAdminRoute(path,request,env);
  if (path === '/v1/campaigns/config' && request.method === 'GET') return json({ paymentMode: campaignMode(env), feeBps: 1000, decimals: 6, minCharacters: 100, reviewHours: 72, appealHours: 72, feeRecipient: env.BOUNTY_FEE_RECIPIENT ?? null });
  if (path === '/v1/campaigns' && request.method === 'GET') {
    const user = await optionalSession(request, env);
    const scope = url.searchParams.get('scope') ?? 'open';
    if (!['open','mine','joined'].includes(scope)) throw new ApiError(400, 'invalid_campaign_filter');
    if (scope !== 'open' && !user) throw new ApiError(401, 'unauthorized');
    const filters = scope === 'mine' ? 'c.creator_skr=?' : scope === 'joined' ? 'EXISTS(SELECT 1 FROM testing_entries e WHERE e.campaign_id=c.id AND e.tester_wallet=?)' : "c.status='open' AND c.deadline>? AND u.status='active' AND EXISTS(SELECT 1 FROM needs n WHERE n.id=c.post_id AND n.deleted_at IS NULL)";
    const limitText = url.searchParams.get('limit') ?? '30';
    if (!/^[1-9]\d?$/.test(limitText) || Number(limitText)>50) throw new ApiError(400,'invalid_campaign_limit');
    const limit = Number(limitText), cursor = url.searchParams.get('cursor');
    if (cursor && !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\|[a-zA-Z0-9_-]{1,100}$/.test(cursor)) throw new ApiError(400,'invalid_campaign_cursor');
    const [cursorTime,cursorId] = cursor?.split('|') ?? [];
    const rows = await env.DB.prepare(`SELECT c.*,s.display_name AS app_name,s.icon_url AS app_icon FROM testing_campaigns c JOIN store_catalog s ON s.android_package=c.store_package JOIN users u ON u.skr_domain=c.creator_skr
      WHERE ${filters} ${scope==='open' && campaignMode(env)!=='simulation' ? "AND c.funding_state!='simulated'" : ''}
      ${user && scope==='open' ? 'AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_skr=? AND b.blocked_skr=c.creator_skr) OR (b.blocker_skr=c.creator_skr AND b.blocked_skr=?))' : ''}
      ${cursor ? 'AND (c.created_at<? OR (c.created_at=? AND c.id<?))' : ''} ORDER BY c.created_at DESC,c.id DESC LIMIT ?`)
      .bind(scope === 'mine' ? user!.skrDomain : scope === 'joined' ? user!.walletAddress : now(), ...(user && scope === 'open' ? [user.skrDomain,user.skrDomain] : []), ...(cursor ? [cursorTime,cursorTime,cursorId] : []),limit+1).all<Row>();
    const page = rows.results.slice(0,limit), last = page.at(-1);
    return json({ items: await Promise.all(page.map(row => serialize(env,row,user))), nextCursor: rows.results.length>limit && last ? `${last.created_at}|${last.id}` : null });
  }
  if (path === '/v1/campaigns' && request.method === 'POST') {
    const user = await requireSession(request,env);
    await services.rate(env,user.skrDomain,'campaign_create',60,5);
    const body = await readJson(request);
    const {title,description,appVersion,requirements,storePackage,capacity,minCharacters,reservationHours,reward,fee,total,deadline,rulesHash} = await validateCampaign(env,user,body,services);
    const campaignId = id('campaign'), timestamp = now(), paid = reward > 0n, postId = paid ? null : id('need');
    const statements = [];
    if (postId) statements.push(env.DB.prepare("INSERT INTO needs(id,author_skr,title,problem,solution_idea,audience,category,created_at,updated_at,status,store_package) VALUES(?,?,?,?,?,'Seeker users','其他',?,?,'testing',?)").bind(postId,user.skrDomain,title,description,requirements,timestamp,timestamp,storePackage));
    statements.push(env.DB.prepare('INSERT INTO testing_campaigns(id,creator_skr,creator_wallet,store_package,post_id,title,description,app_version,requirements,min_characters,capacity,reservation_hours,reward_units,fee_units,total_units,rules_hash,deadline,status,funding_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(campaignId,user.skrDomain,user.walletAddress,storePackage,postId,title,description,appVersion,requirements,minCharacters,capacity,reservationHours,reward.toString(),fee.toString(),total.toString(),rulesHash,new Date(deadline).toISOString(),paid?'awaiting_funding':'open',paid?'unfunded':'free',timestamp,timestamp));
    statements.push(event(env,campaignId,null,user.skrDomain,'created',{rulesHash},timestamp));
    await env.DB.batch(statements);
    return json(await serialize(env,await campaign(env,campaignId,user),user),201);
  }
  const detail = path.match(/^\/v1\/campaigns\/([^/]+)(?:\/(join|close|complete|entries|simulate-fund|simulate-refund|funding-quote))?$/);
  if (detail) {
    const [,campaignId,action] = detail;
    const user = await optionalSession(request,env), parent = await campaign(env,campaignId,user), timestamp = now();
    if (!action && request.method === 'GET') return json(await serialize(env,parent,user));
    if (!user) throw new ApiError(401,'unauthorized');
    if (!action && request.method === 'PUT') {
      if (parent.creator_skr !== user.skrDomain) throw new ApiError(403,'not_campaign_owner');
      if (parent.status !== 'awaiting_funding' || parent.funding_state !== 'unfunded') throw new ApiError(409,'campaign_terms_locked');
      await services.rate(env,user.skrDomain,'campaign_edit',10,3);
      const body = await readJson(request), revision = integer(body,'revision',1,1_000_000);
      const v = await validateCampaign(env,user,body,services);
      if(v.reward===0n) throw new ApiError(400,'draft_reward_required');
      const mutation = id('testing_event');
      const results = await env.DB.batch([
        env.DB.prepare("UPDATE testing_campaigns SET title=?,description=?,app_version=?,requirements=?,store_package=?,capacity=?,min_characters=?,reservation_hours=?,reward_units=?,fee_units=?,total_units=?,rules_hash=?,deadline=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=? AND status='awaiting_funding' AND funding_state='unfunded'")
          .bind(v.title,v.description,v.appVersion,v.requirements,v.storePackage,v.capacity,v.minCharacters,v.reservationHours,v.reward.toString(),v.fee.toString(),v.total.toString(),v.rulesHash,new Date(v.deadline).toISOString(),timestamp,campaignId,revision),
        env.DB.prepare("INSERT INTO testing_events SELECT ?,?,NULL,?,'draft_updated',?,? WHERE changes()=1").bind(mutation,campaignId,user.skrDomain,JSON.stringify({previousRulesHash:parent.rules_hash,rulesHash:v.rulesHash,revision:revision+1}),timestamp),
      ]);
      if (!results[0].meta.changes) throw new ApiError(409,'campaign_state_conflict');
      return json(await serialize(env,await campaign(env,campaignId,user),user));
    }
    if (action === 'entries' && request.method === 'GET') {
      if (parent.creator_skr !== user.skrDomain) throw new ApiError(403,'not_campaign_owner');
      await expireReservations(env,campaignId,timestamp);
      const entries = await env.DB.prepare('SELECT * FROM testing_entries WHERE campaign_id=? ORDER BY reserved_at').bind(campaignId).all();
      return json({items:entries.results});
    }
    if (request.method !== 'POST') throw new ApiError(405,'method_not_allowed');
    if (action === 'join') {
      if(parent.funding_state==='simulated' && campaignMode(env)!=='simulation') throw new ApiError(503,'bounty_simulation_disabled');
      if (parent.creator_skr === user.skrDomain || parent.creator_wallet === user.walletAddress) throw new ApiError(400,'cannot_test_own_campaign');
      await services.rate(env,user.skrDomain,'campaign_join',5);
      await expireReservations(env,campaignId,timestamp);
      const entryId = id('entry'), submitBy = new Date(Math.min(Date.parse(parent.deadline),Date.now()+parent.reservation_hours*3600_000)).toISOString();
      // The admission and capacity check are a single SQLite statement, including concurrent requests.
      const result = await env.DB.prepare(`INSERT INTO testing_entries(id,campaign_id,tester_skr,tester_wallet,status,reserved_at,submit_by)
        SELECT ?,?,?,?,'reserved',?,? FROM testing_campaigns c WHERE c.id=? AND c.status='open' AND c.deadline>?
        AND EXISTS(SELECT 1 FROM needs n WHERE n.id=c.post_id AND n.deleted_at IS NULL)
        AND c.funding_state IN ('free','simulated','confirmed') AND (SELECT COUNT(*) FROM testing_entries WHERE campaign_id=c.id AND ${HELD})<c.capacity
        AND NOT EXISTS(SELECT 1 FROM testing_entries WHERE campaign_id=c.id AND (tester_skr=? OR tester_wallet=?))`)
        .bind(entryId,campaignId,user.skrDomain,user.walletAddress,timestamp,submitBy,campaignId,timestamp,timestamp,user.skrDomain,user.walletAddress).run();
      if (!result.meta.changes) throw new ApiError(409,'campaign_unavailable_or_already_joined');
      return json(await serialize(env,parent,user),201);
    }
    if (parent.creator_skr !== user.skrDomain) throw new ApiError(403,'not_campaign_owner');
    if (action === 'funding-quote') throw new ApiError(503,'bounty_payments_disabled');
    if (action === 'simulate-fund') {
      if (campaignMode(env) !== 'simulation') throw new ApiError(503,'bounty_simulation_disabled');
      if (parent.funding_state === 'simulated') return json(await serialize(env,parent,user));
      const postId = id('need');
      const result = await env.DB.batch([
        env.DB.prepare("INSERT INTO needs(id,author_skr,title,problem,solution_idea,audience,category,created_at,updated_at,status,store_package) SELECT ?,creator_skr,title,description,requirements,'Seeker users','其他',?,?,'testing',store_package FROM testing_campaigns WHERE id=? AND status='awaiting_funding' AND funding_state='unfunded' AND deadline>?").bind(postId,timestamp,timestamp,campaignId,timestamp),
        env.DB.prepare("UPDATE testing_campaigns SET status='open',funding_state='simulated',post_id=?,updated_at=? WHERE id=? AND status='awaiting_funding' AND funding_state='unfunded' AND EXISTS(SELECT 1 FROM needs WHERE id=?)").bind(postId,timestamp,campaignId,postId),
      ]);
      if (!result[1].meta.changes) throw new ApiError(409,'campaign_state_conflict');
      return json(await serialize(env,await campaign(env,campaignId,user),user));
    }
    if (action === 'close') {
      await env.DB.batch([
        env.DB.prepare("UPDATE testing_campaigns SET status=CASE WHEN funding_state='unfunded' THEN 'cancelled' ELSE 'closed' END,updated_at=? WHERE id=? AND status IN ('awaiting_funding','open')").bind(timestamp,campaignId),
        env.DB.prepare("INSERT INTO testing_events SELECT ?,?,NULL,?,'closed','{}',? WHERE changes()=1").bind(id('testing_event'),campaignId,user.skrDomain,timestamp),
        env.DB.prepare("UPDATE needs SET status='unresolved',updated_at=? WHERE id=(SELECT post_id FROM testing_campaigns WHERE id=? AND status IN ('closed','completed','cancelled'))").bind(timestamp,campaignId),
      ]);
      return json(await serialize(env,await campaign(env,campaignId,user),user));
    }
    if (action === 'complete') {
      await expireReservations(env,campaignId,timestamp);
      const result = await env.DB.prepare(`UPDATE testing_campaigns SET status='completed',updated_at=? WHERE id=? AND status='closed' AND funding_state='free'
        AND NOT EXISTS(SELECT 1 FROM testing_entries WHERE campaign_id=? AND status!='paid' AND ${HELD})`).bind(timestamp,campaignId,campaignId,timestamp).run();
      if (!result.meta.changes) throw new ApiError(409,'campaign_has_unsettled_entries');
      return json(await serialize(env,await campaign(env,campaignId,user),user));
    }
    if (action === 'simulate-refund') {
      if (campaignMode(env) !== 'simulation' || parent.funding_state !== 'simulated') throw new ApiError(503,'bounty_simulation_disabled');
      if (parent.status !== 'closed') throw new ApiError(409,'close_campaign_before_refund');
      await expireReservations(env,campaignId,timestamp);
      const result = await env.DB.prepare(`UPDATE testing_campaigns SET refunded_units=CAST(total_units AS INTEGER)-(SELECT COUNT(*) FROM testing_entries WHERE campaign_id=? AND status='paid')*(CAST(reward_units AS INTEGER)+CAST(fee_units AS INTEGER)),status='completed',updated_at=?
        WHERE id=? AND status='closed' AND NOT EXISTS(SELECT 1 FROM testing_entries WHERE campaign_id=? AND status!='paid' AND ${HELD})`).bind(campaignId,timestamp,campaignId,campaignId,timestamp).run();
      if (!result.meta.changes) throw new ApiError(409,'campaign_has_unsettled_entries');
      return json(await serialize(env,await campaign(env,campaignId,user),user));
    }
  }
  const match = path.match(/^\/v1\/testing-entries\/([^/]+)\/(submit|review|withdraw|appeal|simulate-settle)$/);
  if (match && request.method === 'POST') {
    const user = await requireSession(request,env), [,entryId,action] = match;
    await services.rate(env,user.skrDomain,'testing_'+action,5,5);
    const {entry,parent} = await entryFor(env,entryId,user), timestamp = now(), body = await readJson(request);
    const revision = integer(body,'revision',1,1_000_000);
    if (entry.revision !== revision) throw new ApiError(409,'entry_revision_conflict');
    const isTester = entry.tester_wallet === user.walletAddress;
    const resultStatements = [];
    if (['submit','withdraw','appeal'].includes(action) && !isTester || ['review','simulate-settle'].includes(action) && parent.creator_skr !== user.skrDomain) throw new ApiError(403,'not_entry_owner');
    if (action === 'submit') {
      const content = text(body,'body',5000), chars = effectiveCharacters(content), evidence = body.evidenceUrl ?? '';
      if (chars < parent.min_characters) throw new ApiError(400,'testing_report_too_short');
      if (typeof evidence !== 'string' || evidence.length>1000 || evidence && (!/^https:\/\//i.test(evidence) || !URL.canParse(evidence) || new URL(evidence).username || new URL(evidence).password)) throw new ApiError(400,'invalid_testing_evidence');
      await services.moderate(env,user,'comment',[content,evidence]);
      resultStatements.push(env.DB.prepare("UPDATE testing_entries SET body=?,evidence_url=?,character_count=?,status='submitted',submitted_at=?,review_reason='',reviewed_at=NULL,revision=revision+1 WHERE id=? AND revision=? AND status IN ('reserved','changes_requested') AND submit_by>?").bind(content,evidence,chars,timestamp,entryId,revision,timestamp));
    } else if (action === 'review') {
      const decision = body.decision;
      if (!['approve','changes','reject'].includes(String(decision))) throw new ApiError(400,'invalid_testing_decision');
      if (decision === 'changes' && entry.correction_count >= 1) throw new ApiError(409,'testing_correction_limit');
      const reason = decision === 'approve' ? '' : text(body,'reason',1000);
      if (reason) await services.moderate(env,user,'comment',[reason]);
      const next = decision === 'approve' ? BigInt(parent.reward_units)>0n ? 'approved' : 'paid' : decision==='changes'?'changes_requested':'rejected';
      resultStatements.push(env.DB.prepare("UPDATE testing_entries SET status=?,review_reason=?,reviewed_at=?,appeal_by=?,submit_by=?,paid_at=?,correction_count=correction_count+?,revision=revision+1 WHERE id=? AND revision=? AND status='submitted' AND submitted_at>?")
        .bind(next,reason,timestamp,decision==='reject'?new Date(Date.now()+APPEAL_MS).toISOString():null,new Date(Date.now()+parent.reservation_hours*3600_000).toISOString(),next==='paid'?timestamp:null,decision==='changes'?1:0,entryId,revision,new Date(Date.now()-72*3600_000).toISOString()));
    } else if (action === 'withdraw') {
      resultStatements.push(env.DB.prepare("UPDATE testing_entries SET status='withdrawn',revision=revision+1 WHERE id=? AND revision=? AND status IN ('reserved','changes_requested')").bind(entryId,revision));
    } else if (action === 'appeal') {
      const reason = text(body,'reason',1000);
      await services.moderate(env,user,'comment',[reason]);
      const overdue = new Date(Date.now()-72*3600_000).toISOString();
      resultStatements.push(env.DB.prepare("UPDATE testing_entries SET status='disputed',appeal_reason=?,revision=revision+1 WHERE id=? AND revision=? AND ((status='rejected' AND appeal_by>?) OR (status='submitted' AND submitted_at<=?))").bind(reason,entryId,revision,timestamp,overdue));
    } else {
      if (campaignMode(env) !== 'simulation' || parent.funding_state !== 'simulated') throw new ApiError(503,'bounty_simulation_disabled');
      resultStatements.push(env.DB.prepare("UPDATE testing_entries SET status='paid',payment_signature=?,paid_at=?,revision=revision+1 WHERE id=? AND revision=? AND status='approved'").bind('simulation:'+entryId,timestamp,entryId,revision));
    }
    const mutation = id('testing_event');
    // D1 batches are atomic; only the successful transition receives this audit marker.
    resultStatements.push(env.DB.prepare('UPDATE testing_entries SET mutation_id=? WHERE id=? AND revision=? AND changes()=1').bind(mutation,entryId,revision+1));
    resultStatements.push(env.DB.prepare('INSERT INTO testing_events(id,campaign_id,entry_id,actor_skr,action,details_json,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM testing_entries WHERE id=? AND mutation_id=?)')
      .bind(mutation,parent.id,entryId,user.skrDomain,action,JSON.stringify(body),timestamp,entryId,mutation));
    resultStatements.push(env.DB.prepare("INSERT INTO notifications(id,recipient_skr,type,payload_json,created_at) SELECT ?,?,'testing_update',?,? WHERE EXISTS(SELECT 1 FROM testing_entries WHERE id=? AND mutation_id=?)")
      .bind(id('notification'),isTester?parent.creator_skr:entry.tester_skr,JSON.stringify({targetType:'campaign',targetId:parent.id,title:parent.title,actor:user.skrDomain}),timestamp,entryId,mutation));
    const result = await env.DB.batch(resultStatements);
    if (!result[0].meta.changes) throw new ApiError(409,'entry_state_conflict');
    return json(await env.DB.prepare('SELECT * FROM testing_entries WHERE id=?').bind(entryId).first());
  }
  throw new ApiError(404,'not_found');
}

async function testingAdminRoute(path: string, request: Request, env: Env): Promise<Response> {
  const actor = await requireAdmin(request,env);
  const overdue = new Date(Date.now()-72*3600_000).toISOString();
  if (path === '/admin/testing-reviews' && request.method === 'GET') {
    const rows = await env.DB.prepare(`SELECT e.*,c.title,c.requirements,c.app_version,c.min_characters,c.reward_units,c.funding_state,s.display_name AS app_name
      FROM testing_entries e JOIN testing_campaigns c ON c.id=e.campaign_id JOIN store_catalog s ON s.android_package=c.store_package
      WHERE e.status='disputed' OR (e.status='submitted' AND e.submitted_at<=?) ORDER BY e.reserved_at LIMIT 200`).bind(overdue).all();
    return json({items:rows.results,paymentMode:campaignMode(env)});
  }
  const match = path.match(/^\/admin\/testing-entries\/([^/]+)\/resolve$/);
  if (!match || request.method !== 'POST') throw new ApiError(404,'not_found');
  const body = await readJson(request), revision = integer(body,'revision',1,1_000_000), reason = text(body,'reason',1000);
  if (typeof body.approve !== 'boolean') throw new ApiError(400,'invalid_testing_decision');
  const entry = await env.DB.prepare('SELECT e.*,c.reward_units,c.creator_skr,c.title FROM testing_entries e JOIN testing_campaigns c ON c.id=e.campaign_id WHERE e.id=?').bind(match[1]).first<Row>();
  if (!entry) throw new ApiError(404,'entry_not_found');
  const mutation = id('testing_event'), timestamp = now();
  const status = body.approve ? BigInt(entry.reward_units)>0n ? 'approved' : 'paid' : 'rejected';
  const result = await env.DB.batch([
    env.DB.prepare(`UPDATE testing_entries SET status=?,resolution_reason=?,appeal_by=?,paid_at=?,mutation_id=?,revision=revision+1 WHERE id=? AND revision=? AND (status='disputed' OR (status='submitted' AND submitted_at<=?))`)
      .bind(status,reason,body.approve?null:timestamp,status==='paid'?timestamp:null,mutation,entry.id,revision,overdue),
    env.DB.prepare(`INSERT INTO testing_events SELECT ?,?,?,?,'resolved',?,? WHERE EXISTS(SELECT 1 FROM testing_entries WHERE mutation_id=?)`)
      .bind(mutation,entry.campaign_id,entry.id,actor,JSON.stringify({approve:body.approve,reason,revision:revision+1}),timestamp,mutation),
    env.DB.prepare(`INSERT INTO audit_log SELECT ?,?,'testing_resolved','testing_entry',?,?,? WHERE EXISTS(SELECT 1 FROM testing_entries WHERE mutation_id=?)`)
      .bind(id('audit'),actor,entry.id,JSON.stringify({approve:body.approve,reason}),timestamp,mutation),
    ...[entry.tester_skr,entry.creator_skr].map(recipient=>env.DB.prepare(`INSERT INTO notifications(id,recipient_skr,type,payload_json,created_at) SELECT ?,?,'testing_update',?,? WHERE EXISTS(SELECT 1 FROM testing_entries WHERE mutation_id=?)`)
      .bind(id('notification'),recipient,JSON.stringify({targetType:'campaign',targetId:entry.campaign_id,title:entry.title,status}),timestamp,mutation)),
  ]);
  if (!result[0].meta.changes) throw new ApiError(409,'entry_state_or_revision_conflict');
  return json({status,revision:revision+1});
}
