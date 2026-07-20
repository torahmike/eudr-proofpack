import type { BillingPlanId } from "./plans";

type PaddleEnvironment = "sandbox" | "production";
type PaddlePriceKey = "starter" | "growth" | "consultant" | "extraProofPack";

type PaddleEnv = Env & {
  PADDLE_CLIENT_TOKEN?: string;
  PADDLE_ENVIRONMENT?: string;
  PADDLE_PRICE_STARTER?: string;
  PADDLE_PRICE_GROWTH?: string;
  PADDLE_PRICE_CONSULTANT?: string;
  PADDLE_PRICE_EXTRA_PROOF_PACK?: string;
  PADDLE_WEBHOOK_SECRET?: string;
};

interface PaddleEvent {
  event_id: string;
  event_type: string;
  occurred_at?: string;
  data: PaddleEventData;
}

interface PaddleEventData {
  id?: string;
  status?: string;
  customer_id?: string;
  subscription_id?: string;
  current_billing_period?: { ends_at?: string };
  next_billed_at?: string;
  custom_data?: Record<string, unknown> | null;
  items?: Array<{ price?: { id?: string } }>;
}

export interface PaddleCheckoutConfig {
  enabled: boolean;
  environment: PaddleEnvironment;
  clientToken: string | null;
  prices: Record<PaddlePriceKey, string | null>;
}

export function getPaddleCheckoutConfig(env: Env): PaddleCheckoutConfig {
  const paddleEnv = env as PaddleEnv;
  const environment = paddleEnv.PADDLE_ENVIRONMENT === "production" ? "production" : "sandbox";
  const prices = {
    starter: paddleEnv.PADDLE_PRICE_STARTER ?? null,
    growth: paddleEnv.PADDLE_PRICE_GROWTH ?? null,
    consultant: paddleEnv.PADDLE_PRICE_CONSULTANT ?? null,
    extraProofPack: paddleEnv.PADDLE_PRICE_EXTRA_PROOF_PACK ?? null,
  };
  return {
    enabled: Boolean(paddleEnv.PADDLE_CLIENT_TOKEN && prices.starter && prices.growth && prices.consultant),
    environment,
    clientToken: paddleEnv.PADDLE_CLIENT_TOKEN ?? null,
    prices,
  };
}

export async function handlePaddleWebhook(request: Request, env: Env): Promise<Response> {
  const paddleEnv = env as PaddleEnv;
  if (!paddleEnv.PADDLE_WEBHOOK_SECRET) return json({ error: "Paddle webhook secret is not configured" }, 503);

  const signature = request.headers.get("Paddle-Signature");
  const body = await request.text();
  const verified = await verifySignature(signature, body, paddleEnv.PADDLE_WEBHOOK_SECRET);
  if (!verified.ok) return json({ error: verified.message }, verified.status);

  const event = JSON.parse(body) as PaddleEvent;
  if (!event.event_id || !event.event_type || !event.data) return json({ error: "Invalid Paddle event" }, 400);

  const existing = await env.DB.prepare(`SELECT event_id FROM paddle_webhook_events WHERE event_id = ?`).bind(event.event_id).first<{ event_id: string }>();
  if (existing) return json({ ok: true, duplicate: true });

  const result = await applyPaddleEvent(env, event);
  await env.DB.prepare(`INSERT INTO paddle_webhook_events (event_id, event_type, organization_id, processed_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`).bind(event.event_id, event.event_type, result.organizationId ?? null).run();
  return json({ ok: true, ...result });
}

async function applyPaddleEvent(env: Env, event: PaddleEvent): Promise<{ organizationId?: string; ignored?: string }> {
  if (!["transaction.completed", "subscription.created", "subscription.updated", "subscription.canceled"].includes(event.event_type)) {
    return { ignored: "event_not_handled" };
  }

  const organizationId = readCustomString(event.data.custom_data, "organizationId") ?? readCustomString(event.data.custom_data, "organization_id");
  if (!organizationId) return { ignored: "missing_organization" };

  const priceId = findPriceId(event.data);
  const requestedPlan = readCustomString(event.data.custom_data, "plan");
  const plan = event.event_type === "subscription.canceled" || event.data.status === "canceled" ? "starter" : normalizePlan(requestedPlan) ?? planForPriceId(env, priceId) ?? "starter";
  const status = statusForEvent(event);
  const subscriptionId = event.event_type.startsWith("subscription.") ? event.data.id ?? null : event.data.subscription_id ?? null;
  const billingPeriodEndsAt = event.data.current_billing_period?.ends_at ?? event.data.next_billed_at ?? null;

  await env.DB.prepare(
    `UPDATE organizations
       SET billing_plan = ?,
           billing_status = ?,
           extra_proof_pack_allowance = CASE WHEN ? = 'canceled' THEN 0 ELSE extra_proof_pack_allowance END,
           paddle_customer_id = COALESCE(?, paddle_customer_id),
           paddle_subscription_id = COALESCE(?, paddle_subscription_id),
           paddle_price_id = COALESCE(?, paddle_price_id),
           billing_period_ends_at = COALESCE(?, billing_period_ends_at)
     WHERE id = ?`,
  )
    .bind(plan, status, status, event.data.customer_id ?? null, subscriptionId, priceId, billingPeriodEndsAt, organizationId)
    .run();

  return { organizationId };
}

function statusForEvent(event: PaddleEvent): string {
  if (event.event_type === "transaction.completed") return "active";
  if (event.event_type === "subscription.canceled" || event.data.status === "canceled") return "canceled";
  if (event.data.status === "past_due" || event.data.status === "paused") return event.data.status;
  return "active";
}

function planForPriceId(env: Env, priceId: string | null): BillingPlanId | null {
  if (!priceId) return null;
  const prices = getPaddleCheckoutConfig(env).prices;
  if (priceId === prices.starter) return "starter";
  if (priceId === prices.growth) return "growth";
  if (priceId === prices.consultant) return "consultant";
  return null;
}

function normalizePlan(value: string | null): BillingPlanId | null {
  if (value === "starter" || value === "growth" || value === "consultant" || value === "enterprise") return value;
  return null;
}

function findPriceId(data: PaddleEventData): string | null {
  for (const item of data.items ?? []) {
    const priceId = item.price?.id;
    if (priceId) return priceId;
  }
  return null;
}

function readCustomString(customData: PaddleEventData["custom_data"], key: string): string | null {
  const value = customData?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

async function verifySignature(signatureHeader: string | null, body: string, secret: string): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (!signatureHeader) return { ok: false, status: 401, message: "Missing Paddle signature" };
  const parts = Object.fromEntries(signatureHeader.split(";").map((part) => {
    const [key, ...value] = part.trim().split("=");
    return [key, value.join("=")];
  }));
  const timestamp = parts.ts;
  const expected = parts.h1;
  if (!timestamp || !expected) return { ok: false, status: 401, message: "Invalid Paddle signature" };

  const eventTime = Number(timestamp);
  if (!Number.isFinite(eventTime) || Math.abs(Date.now() / 1000 - eventTime) > 300) return { ok: false, status: 401, message: "Expired Paddle signature" };

  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}:${body}`));
  const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(actual, expected) ? { ok: true } : { ok: false, status: 401, message: "Invalid Paddle signature" };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
