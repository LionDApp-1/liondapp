import { isPublicContentAllowed } from './moderation';
import type { Env } from './types';
import { ApiError, id, json, now, readJson } from './http';

function serializeProject(row: Record<string, unknown>) {
  const {policy_fields,...item}=row;
  return {...item,policy_violation:!isPublicContentAllowed(row.target_type as 'need'|'work',JSON.parse(String(policy_fields)))};
}

const stages = ['new', 'in_progress', 'waiting', 'done'];

export async function operationsRoute(path: string, request: Request, env: Env, actor: string): Promise<Response> {
  if (path === '/admin/operations/summary' && request.method === 'GET') {
    const generatedAt = now();
    const today = generatedAt.slice(0, 10);
    const since = new Date(Date.parse(today) - 6 * 86400_000).toISOString();
    const [totals, stagesResult, projects, reportCounts, reportQueue, trend, owners] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS total,
        COALESCE(SUM(target_type='need'),0) AS needs,COALESCE(SUM(target_type='work'),0) AS works,
        COALESCE(SUM(stage!='done'),0) AS backlog,
        COALESCE(SUM(stage!='done' AND assignee=''),0) AS unassigned,
        COALESCE(SUM(stage!='done' AND due_at IS NOT NULL AND due_at<?),0) AS overdue,
        COALESCE(SUM(created_at>=?),0) AS new_today,
        MIN(CASE WHEN stage!='done' THEN stage_since END) AS oldest_since
        FROM operations_project_index`).bind(generatedAt,today).first(),
      env.DB.prepare('SELECT stage,COUNT(*) AS count FROM operations_project_index GROUP BY stage').all(),
      env.DB.prepare(`SELECT * FROM operations_project_index WHERE stage!='done'
        ORDER BY CASE WHEN due_at IS NOT NULL AND due_at<? THEN 0 ELSE 1 END,stage_since,id LIMIT 6`).bind(generatedAt).all(),
      env.DB.prepare(`SELECT COUNT(*) AS total,MIN(created_at) AS oldest_since FROM
        (SELECT created_at FROM reports WHERE status='open' UNION ALL SELECT created_at FROM message_reports WHERE status='open')`).first(),
      env.DB.prepare(`SELECT id,kind,reason,created_at FROM (
        SELECT id,'report' AS kind,reason,created_at FROM reports WHERE status='open'
        UNION ALL SELECT id,'message_report',reason,created_at FROM message_reports WHERE status='open')
        ORDER BY created_at,id LIMIT 4`).all(),
      env.DB.prepare(`SELECT substr(created_at,1,10) AS day,target_type,COUNT(*) AS count
        FROM operations_project_index WHERE created_at>=? GROUP BY day,target_type ORDER BY day`).bind(since).all(),
      env.DB.prepare(`SELECT assignee,COUNT(*) AS count FROM operations_project_index
        WHERE stage!='done' GROUP BY assignee ORDER BY count DESC,assignee LIMIT 6`).all(),
    ]);
    return json({ generatedAt, operator: actor.replace(/^password:/,''), totals, stages: stagesResult.results,
      projects: projects.results.map(serializeProject), reports: { ...reportCounts, items: reportQueue.results }, trend: trend.results, owners: owners.results });
  }
  if (path === '/admin/operations/projects' && request.method === 'GET') {
    const params = new URL(request.url).searchParams;
    const stage = params.get('stage') || 'all';
    const type = params.get('type') || 'all';
    const owner = params.get('owner') || 'all';
    const page = Number(params.get('page') || 1);
    const query = (params.get('q') || '').trim();
    const period = params.get('period') || 'all';
    if (!['all','today'].includes(period) || !['all','active',...stages].includes(stage) || !['all','need','work'].includes(type) ||
      !['all','unassigned','mine'].includes(owner) || !Number.isSafeInteger(page) || page<1 || page>100000 || query.length>120) throw new ApiError(400,'invalid_operations_filter');
    const filters: string[]=[]; const values: string[]=[];
    if (period==='today') { filters.push('created_at>=?'); values.push(now().slice(0,10)); }
    if (stage==='active') filters.push("stage!='done'");
    else if (stage!=='all') { filters.push('stage=?'); values.push(stage); }
    if (type!=='all') { filters.push('target_type=?'); values.push(type); }
    if (owner==='unassigned') filters.push("assignee=''");
    if (owner==='mine') { filters.push('assignee=?'); values.push(actor.replace(/^password:/,'')); }
    if (params.get('overdue')==='true') { filters.push("stage!='done' AND due_at IS NOT NULL AND due_at<?"); values.push(now()); }
    if(query) { filters.push("(instr(lower(title),lower(?))>0 OR instr(lower(author_skr),lower(?))>0 OR instr(lower(assignee),lower(?))>0)"); values.push(query,query,query); }
    const where = filters.length ? 'WHERE '+filters.join(' AND ') : '';
    const total = await env.DB.prepare(`SELECT COUNT(*) AS count FROM operations_project_index ${where}`).bind(...values).first<{count:number}>();
    const result = await env.DB.prepare(`SELECT * FROM operations_project_index ${where}
      ORDER BY stage='done',CASE WHEN stage!='done' AND due_at IS NOT NULL AND due_at<? THEN 0 ELSE 1 END,stage_since,target_type,id LIMIT 25 OFFSET ?`)
      .bind(...values,now(),(page-1)*25).all();
    return json({items:result.results.map(serializeProject),total:total?.count??0,page,pageSize:25,generatedAt:now(),operator:actor.replace(/^password:/,'')});
  }
  const target = path.match(/^\/admin\/operations\/projects\/(need|work)\/([^/]+)$/);
  if (target) {
    const [,type,targetId]=target;
    const row = await env.DB.prepare('SELECT * FROM operations_project_index WHERE target_type=? AND id=?').bind(type,targetId).first<Record<string,unknown>>();
    if(!row) throw new ApiError(404,'not_found');
    if(request.method==='GET') return json(serializeProject(row));
    if(request.method==='POST') {
      const body=await readJson(request);
      if(typeof body.stage!=='string' || !stages.includes(body.stage) || typeof body.assignee!=='string' || body.assignee.trim().length>80 ||
        /[\u0000-\u001f\u007f]/.test(body.assignee) || typeof body.note!=='string' || body.note.length>2000 || !Number.isSafeInteger(body.revision) || Number(body.revision)<0)
        throw new ApiError(400,'invalid_operations_update');
      let due: string|null=null;
      if(body.due_at!==null) {
        if(typeof body.due_at!=='string' || !/^\d{4}-\d{2}-\d{2}T/.test(body.due_at) || !Number.isFinite(Date.parse(body.due_at))) throw new ApiError(400,'invalid_operations_due');
        due=new Date(body.due_at).toISOString();
      }
      if(type==='work' && row.public_status==='pending' && body.stage==='done') throw new ApiError(409,'review_required');
      if(Number(row.revision)!==body.revision) throw new ApiError(409,'operations_conflict');
      const timestamp=now(); const mutation=id('operation');
      const result=await env.DB.batch([
        env.DB.prepare(`INSERT INTO operations_projects(target_type,target_id,stage,assignee,due_at,note,stage_since,updated_at,revision,mutation_id)
          SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM operations_project_index WHERE target_type=? AND id=? AND revision=? AND NOT(target_type='work' AND public_status='pending' AND ?='done'))
          ON CONFLICT(target_type,target_id) DO UPDATE SET stage=excluded.stage,assignee=excluded.assignee,due_at=excluded.due_at,
          note=excluded.note,stage_since=excluded.stage_since,updated_at=excluded.updated_at,revision=excluded.revision,mutation_id=excluded.mutation_id
          WHERE operations_projects.revision=?`)
          .bind(type,targetId,body.stage,body.assignee.trim(),due,body.note.trim(),row.stage===body.stage?row.stage_since:timestamp,timestamp,Number(body.revision)+1,mutation,type,targetId,body.revision,body.stage,body.revision),
        env.DB.prepare(`INSERT INTO audit_log(id,actor,action,target_type,target_id,detail_json,created_at)
          SELECT ?,?,'operations_update',?,?,?,? WHERE EXISTS(SELECT 1 FROM operations_projects WHERE mutation_id=?)`)
          .bind(id('audit'),actor,type,targetId,JSON.stringify({stage:body.stage,assigned:!!body.assignee.trim(),due_at:due,revision:Number(body.revision)+1}),timestamp,mutation),
      ]);
      if(!result[0].meta.changes) throw new ApiError(409,'operations_conflict');
      return json({status:'saved',revision:Number(body.revision)+1});
    }
  }
  throw new ApiError(404,'not_found');
}
