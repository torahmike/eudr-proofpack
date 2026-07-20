import { getSessionContext } from "../db/queries";
import type { SessionContext } from "../db/types";

const cookieName = "eudr_session";

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  const cookies = header.split(";").map((part) => part.trim());
  for (const cookie of cookies) {
    const [key, ...value] = cookie.split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function sessionCookie(sessionId: string, maxAgeSeconds: number): string {
  return `${cookieName}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie(): string {
  return `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function requireSession(request: Request, env: Env): Promise<SessionContext | Response> {
  const sessionId = getCookie(request, cookieName);
  if (!sessionId) return json({ error: "Authentication required" }, 401);
  const session = await getSessionContext(env, sessionId);
  return session ?? json({ error: "Invalid or expired session" }, 401);
}

export function securityHeaders(options: { dev?: boolean } = {}): Record<string, string> {
  const csp = options.dev
    ? "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self' https://*.paddle.com; img-src 'self' data: https://*.paddle.com; script-src 'self' 'unsafe-inline' https://cdn.paddle.com; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss: https://*.paddle.com; frame-src https://*.paddle.com"
    : "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self' https://*.paddle.com; img-src 'self' data: https://*.paddle.com; script-src 'self' https://cdn.paddle.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.paddle.com; frame-src https://*.paddle.com";
  return {
    "Content-Security-Policy": csp,
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

export function withSecurityHeaders(response: Response, request?: Request): Response {
  const headers = new Headers(response.headers);
  const isLocalDev = request ? ["127.0.0.1", "localhost"].includes(new URL(request.url).hostname) : false;
  for (const [key, value] of Object.entries(securityHeaders({ dev: isLocalDev }))) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...securityHeaders(),
      ...headers,
    },
  });
}

export function isResponse(value: SessionContext | Response): value is Response {
  return value instanceof Response;
}

export function secureToken(bytes = 32): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
