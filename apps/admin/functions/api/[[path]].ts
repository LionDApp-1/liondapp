interface Env {
  LIONDAPP_API: Fetcher;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const source = new URL(context.request.url);
  const targetPath = source.pathname.replace(/^\/api/, "") || "/";
  const target = new URL(targetPath + source.search, "https://liondapp-api.internal");
  const headers = new Headers(context.request.headers);
  const accessAssertion = context.request.headers.get("cf-access-jwt-assertion");
  if (accessAssertion) headers.set("cf-access-jwt-assertion", accessAssertion);
  if (!targetPath.startsWith("/admin/") && !targetPath.startsWith("/media/") && !["/health", "/v1/config"].includes(targetPath)) return Response.json({ error: "not_found" }, { status: 404 });
  return context.env.LIONDAPP_API.fetch(new Request(target, {
    method: context.request.method,
    headers,
    body: context.request.method === "GET" || context.request.method === "HEAD" ? undefined : context.request.body,
    redirect: "manual",
  }));
};

