interface Env { LIONDAPP_API: Fetcher }
// The public site has a read-only, bounded proxy. Never forward cookies, signatures,
// authorization headers, arbitrary paths or an upstream URL supplied by a visitor.
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  if (request.method !== 'GET') return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: { Allow: 'GET' } });
  const headers = { 'Cache-Control': 'public, max-age=60', 'X-Content-Type-Options': 'nosniff' };
  try {
    if (url.pathname === '/api/status') {
      const response = await env.LIONDAPP_API.fetch('https://liondapp-api.internal/health');
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json() as Record<string, unknown>;
      return Response.json({ available: true, bountyPaymentMode: data.bountyPaymentMode ?? 'disabled', checkedAt: new Date().toISOString() }, { headers });
    }
    if (url.pathname === '/api/catalog') {
      const q = (url.searchParams.get('q') ?? '').trim();
      if(q.length > 100) return Response.json({ error: 'invalid_search_query' }, { status: 400 });
      const response = await env.LIONDAPP_API.fetch('https://liondapp-api.internal/v1/store-apps?limit=12&q=' + encodeURIComponent(q));
      if(!response.ok) throw new Error('unavailable');
      const data = await response.json() as { items: Record<string, unknown>[] };
      return Response.json({ items: data.items.slice(0,12).map(item => ({
        package: item.android_package, name: item.display_name,
        subtitle: item.subtitle, subtitleZh: item.subtitle_zh,
        category: item.category_name, categoryZh: item.category_name_zh,
        publisher: item.publisher_name,
      })) }, { headers });
    }
    return Response.json({ error: 'not_found' }, { status: 404 });
  } catch {
    return Response.json({ error: 'service_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
};
