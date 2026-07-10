import { secureToken } from "./session";
import type { UserRow } from "../db/types";

interface OAuthEnv {
  APP_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

interface GoogleTokenResponse {
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleClaims {
  iss: string;
  aud: string;
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  exp: number;
  nonce?: string;
}

const stateCookieName = "eudr_oauth_state";
const googleAuthUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const googleTokenUrl = "https://oauth2.googleapis.com/token";
const googleJwksUrl = "https://www.googleapis.com/oauth2/v3/certs";

export function oauthProviders(env: Env) {
  const oauthEnv = env as unknown as OAuthEnv;
  return { google: Boolean(oauthEnv.GOOGLE_CLIENT_ID && oauthEnv.GOOGLE_CLIENT_SECRET) };
}

export function startGoogleOAuth(request: Request, env: Env): Response {
  const oauthEnv = env as unknown as OAuthEnv;
  if (!oauthEnv.GOOGLE_CLIENT_ID || !oauthEnv.GOOGLE_CLIENT_SECRET) return jsonRedirect("/login?oauth_error=Google%20OAuth%20is%20not%20configured");
  const state = secureToken(24);
  const nonce = secureToken(24);
  const url = new URL(googleAuthUrl);
  url.searchParams.set("client_id", oauthEnv.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", googleRedirectUri(request, env));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("prompt", "select_account");
  return new Response(null, { status: 302, headers: { Location: url.toString(), "Set-Cookie": stateCookie(state, nonce) } });
}

export async function completeGoogleOAuth(request: Request, env: Env): Promise<UserRow | Response> {
  const oauthEnv = env as unknown as OAuthEnv;
  if (!oauthEnv.GOOGLE_CLIENT_ID || !oauthEnv.GOOGLE_CLIENT_SECRET) return jsonRedirect("/login?oauth_error=Google%20OAuth%20is%20not%20configured");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookie = readOAuthCookie(request);
  if (!code || !state || !cookie || cookie.state !== state) return jsonRedirect("/login?oauth_error=Invalid%20OAuth%20state");

  const tokenResponse = await fetch(googleTokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: oauthEnv.GOOGLE_CLIENT_ID,
      client_secret: oauthEnv.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: googleRedirectUri(request, env),
    }),
  });
  const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;
  if (!tokenResponse.ok || !tokenData.id_token) return jsonRedirect(`/login?oauth_error=${encodeURIComponent(tokenData.error_description ?? tokenData.error ?? "OAuth token exchange failed")}`);

  const claims = await verifyGoogleIdToken(tokenData.id_token, oauthEnv.GOOGLE_CLIENT_ID, cookie.nonce);
  if (!claims.email_verified) return jsonRedirect("/login?oauth_error=Google%20email%20is%20not%20verified");
  return upsertOAuthUser(env, claims);
}

export function clearOAuthStateCookie(): string {
  return `${stateCookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

async function upsertOAuthUser(env: Env, claims: GoogleClaims): Promise<UserRow> {
  const linked = await env.DB.prepare(
    `SELECT users.* FROM oauth_accounts JOIN users ON users.id = oauth_accounts.user_id WHERE oauth_accounts.provider = 'google' AND oauth_accounts.provider_user_id = ?`,
  )
    .bind(claims.sub)
    .first<UserRow>();
  if (linked) {
    await env.DB.prepare(`UPDATE oauth_accounts SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE provider = 'google' AND provider_user_id = ?`).bind(claims.email.toLowerCase(), claims.sub).run();
    if (!linked.email_verified_at) await env.DB.prepare(`UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(linked.id).run();
    return env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(linked.id).first<UserRow>() as Promise<UserRow>;
  }

  const email = claims.email.toLowerCase();
  const existing = await env.DB.prepare(`SELECT * FROM users WHERE email = ?`).bind(email).first<UserRow>();
  if (existing) {
    await env.DB.batch([
      env.DB.prepare(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP), name = COALESCE(name, ?) WHERE id = ?`).bind(claims.name ?? null, existing.id),
      env.DB.prepare(`INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id, email) VALUES (?, ?, 'google', ?, ?)`).bind(crypto.randomUUID(), existing.id, claims.sub, email),
    ]);
    return env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(existing.id).first<UserRow>() as Promise<UserRow>;
  }

  const userId = crypto.randomUUID();
  const organizationId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, name, email_verified_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`).bind(userId, email, claims.name ?? null),
    env.DB.prepare(`INSERT INTO organizations (id, name, owner_user_id) VALUES (?, ?, ?)`).bind(organizationId, `${email.split("@")[0]}'s organization`, userId),
    env.DB.prepare(`INSERT INTO organization_members (id, organization_id, user_id, role) VALUES (?, ?, ?, 'owner')`).bind(crypto.randomUUID(), organizationId, userId),
    env.DB.prepare(`INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id, email) VALUES (?, ?, 'google', ?, ?)`).bind(crypto.randomUUID(), userId, claims.sub, email),
  ]);
  return env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(userId).first<UserRow>() as Promise<UserRow>;
}

async function verifyGoogleIdToken(idToken: string, clientId: string, nonce: string): Promise<GoogleClaims> {
  const [encodedHeader, encodedPayload, encodedSignature] = idToken.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) throw new Error("Invalid Google ID token");
  const header = JSON.parse(base64UrlDecodeText(encodedHeader)) as { alg?: string; kid?: string };
  const claims = JSON.parse(base64UrlDecodeText(encodedPayload)) as GoogleClaims;
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported Google ID token algorithm");
  if (!(claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com")) throw new Error("Invalid Google issuer");
  if (claims.aud !== clientId) throw new Error("Invalid Google audience");
  if (claims.exp <= Math.floor(Date.now() / 1000)) throw new Error("Expired Google ID token");
  if (claims.nonce !== nonce) throw new Error("Invalid Google nonce");

  const jwks = (await (await fetch(googleJwksUrl)).json()) as { keys: Array<JsonWebKey & { kid?: string }> };
  const jwk = jwks.keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error("Google signing key not found");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const signature = toArrayBuffer(base64UrlToBytes(encodedSignature));
  const data = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, data);
  if (!valid) throw new Error("Invalid Google ID token signature");
  return claims;
}

function stateCookie(state: string, nonce: string): string {
  return `${stateCookieName}=${encodeURIComponent(`${state}.${nonce}`)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
}

function readOAuthCookie(request: Request): { state: string; nonce: string } | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  const value = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${stateCookieName}=`))?.split("=").slice(1).join("=");
  if (!value) return null;
  const [state, nonce] = decodeURIComponent(value).split(".");
  return state && nonce ? { state, nonce } : null;
}

function googleRedirectUri(request: Request, env: Env): string {
  const oauthEnv = env as unknown as OAuthEnv;
  return `${oauthEnv.APP_URL ?? new URL(request.url).origin}/api/auth/oauth/google/callback`;
}

function jsonRedirect(path: string): Response {
  return new Response(null, { status: 302, headers: { Location: path, "Set-Cookie": clearOAuthStateCookie() } });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function base64UrlDecodeText(value: string): string {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}


