import { passwordSession } from "./admin-password";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { ApiError } from "./http";
import type { Env } from "./types";

export async function requireAccessAdmin(request: Request, env: Env): Promise<string> {
  const assertion = request.headers.get("cf-access-jwt-assertion");
  if (!assertion || !env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD || !env.ADMIN_EMAIL) {
    throw new ApiError(401, "admin_authentication_required");
  }
  const issuer = `https://${env.CF_ACCESS_TEAM_DOMAIN}`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  try {
    const { payload } = await jwtVerify(assertion, jwks, { issuer, audience: env.CF_ACCESS_AUD });
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    if (email !== env.ADMIN_EMAIL.toLowerCase()) throw new ApiError(403, "admin_forbidden");
    return email;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, "invalid_access_assertion");
  }
}

export async function requireAdmin(request: Request, env: Env): Promise<string> {
  return await passwordSession(request, env) ?? await requireAccessAdmin(request, env);
}
