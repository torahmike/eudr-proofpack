import type { UserRow } from "../db/types";

export interface VerificationSendResult {
  emailVerified: boolean;
  emailDeliveryConfigured: boolean;
  verificationSent: boolean;
  verificationUrl?: string;
  message: string;
}

interface EmailEnv {
  APP_ENV?: string;
  APP_URL?: string;
  EMAIL_FROM?: string;
  EMAIL_WEBHOOK_URL?: string;
  RESEND_API_KEY?: string;
}

const ttlSeconds = 60 * 60 * 24;

export function verificationDto(user: UserRow) {
  return { emailVerified: Boolean(user.email_verified_at), emailVerifiedAt: user.email_verified_at };
}

export async function createAndSendVerification(env: Env, user: UserRow, request: Request): Promise<VerificationSendResult> {
  if (user.email_verified_at) return { emailVerified: true, emailDeliveryConfigured: true, verificationSent: false, message: "Email already verified" };
  const token = secureToken();
  const tokenHash = await hashToken(token);
  await env.DB.prepare(`DELETE FROM email_verification_tokens WHERE user_id = ? AND used_at IS NULL`).bind(user.id).run();
  await env.DB.prepare(`INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, datetime('now', ?))`).bind(crypto.randomUUID(), user.id, tokenHash, `+${ttlSeconds} seconds`).run();
  await env.DB.prepare(`UPDATE users SET email_verification_sent_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(user.id).run();

  const verificationUrl = `${appUrl(env, request)}/verify-email?token=${encodeURIComponent(token)}`;
  const sent = await sendVerificationEmail(env, user.email, verificationUrl);
  const revealLocalLink = getEmailEnv(env).APP_ENV !== "production";
  return {
    emailVerified: false,
    emailDeliveryConfigured: sent.configured,
    verificationSent: sent.sent,
    verificationUrl: revealLocalLink ? verificationUrl : undefined,
    message: sent.sent ? "Verification email sent" : "Verification token created; configure EMAIL_WEBHOOK_URL or RESEND_API_KEY and EMAIL_FROM to deliver email",
  };
}

export async function verifyEmailToken(env: Env, token: string): Promise<UserRow | null> {
  const tokenHash = await hashToken(token);
  const row = await env.DB.prepare(
    `SELECT users.* FROM email_verification_tokens JOIN users ON users.id = email_verification_tokens.user_id WHERE email_verification_tokens.token_hash = ? AND email_verification_tokens.used_at IS NULL AND email_verification_tokens.expires_at > datetime('now')`,
  )
    .bind(tokenHash)
    .first<UserRow>();
  if (!row) return null;
  await env.DB.batch([
    env.DB.prepare(`UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE token_hash = ?`).bind(tokenHash),
    env.DB.prepare(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP) WHERE id = ?`).bind(row.id),
  ]);
  return env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(row.id).first<UserRow>();
}

export function shouldRequireVerifiedEmail(env: Env): boolean {
  return getEmailEnv(env).REQUIRE_VERIFIED_EMAIL === "true";
}

async function sendVerificationEmail(env: Env, to: string, verificationUrl: string): Promise<{ configured: boolean; sent: boolean }> {
  const emailEnv = getEmailEnv(env);
  const subject = "Verify your EUDR ProofPack email";
  const text = `Verify your EUDR ProofPack email: ${verificationUrl}`;
  const html = `<p>Verify your EUDR ProofPack email:</p><p><a href="${escapeHtml(verificationUrl)}">Verify email</a></p>`;

  if (emailEnv.EMAIL_WEBHOOK_URL) {
    const response = await fetch(emailEnv.EMAIL_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, text, html, verificationUrl }),
    });
    return { configured: true, sent: response.ok };
  }

  if (emailEnv.RESEND_API_KEY && emailEnv.EMAIL_FROM) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${emailEnv.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: emailEnv.EMAIL_FROM, to, subject, text, html }),
    });
    return { configured: true, sent: response.ok };
  }

  return { configured: false, sent: false };
}

function appUrl(env: Env, request: Request): string {
  return getEmailEnv(env).APP_URL ?? new URL(request.url).origin;
}

function getEmailEnv(env: Env): EmailEnv & { REQUIRE_VERIFIED_EMAIL?: string } {
  return env as unknown as EmailEnv & { REQUIRE_VERIFIED_EMAIL?: string };
}

function secureToken(bytes = 32): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);
}

