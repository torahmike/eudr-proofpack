import type { ActivityEventRow, DocumentRow, OrganizationRow, OrganizationMemberRow, PlotRow, ProofPackRow, SessionContext, UserRow } from "./types";

export async function getSessionContext(env: Env, sessionId: string): Promise<SessionContext | null> {
  const user = await env.DB.prepare(
    `SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ? AND sessions.expires_at > datetime('now') AND sessions.revoked_at IS NULL`,
  )
    .bind(sessionId)
    .first<UserRow>();
  if (!user) return null;

  const row = await env.DB.prepare(
    `SELECT organizations.id AS org_id, organizations.name, organizations.owner_user_id, organizations.billing_plan, organizations.billing_status, organizations.extra_proof_pack_allowance, organizations.paddle_customer_id, organizations.paddle_subscription_id, organizations.paddle_price_id, organizations.billing_period_ends_at, organizations.created_at,
            organization_members.id AS member_id, organization_members.role
     FROM organizations
     JOIN organization_members ON organization_members.organization_id = organizations.id
     WHERE organization_members.user_id = ?
     ORDER BY organizations.created_at ASC LIMIT 1`,
  )
    .bind(user.id)
    .first<{ org_id: string; name: string; owner_user_id: string; billing_plan: string; billing_status: string; extra_proof_pack_allowance: number; paddle_customer_id: string | null; paddle_subscription_id: string | null; paddle_price_id: string | null; billing_period_ends_at: string | null; created_at: string; member_id: string; role: OrganizationMemberRow["role"] }>();
  if (!row) return null;

  return {
    sessionId,
    user,
    organization: { id: row.org_id, name: row.name, owner_user_id: row.owner_user_id, billing_plan: row.billing_plan, billing_status: row.billing_status, extra_proof_pack_allowance: row.extra_proof_pack_allowance, paddle_customer_id: row.paddle_customer_id, paddle_subscription_id: row.paddle_subscription_id, paddle_price_id: row.paddle_price_id, billing_period_ends_at: row.billing_period_ends_at, created_at: row.created_at },
    membership: { id: row.member_id, organization_id: row.org_id, user_id: user.id, role: row.role },
  };
}

export async function ensurePackAccess(env: Env, proofPackId: string, userId: string): Promise<ProofPackRow | null> {
  return env.DB.prepare(
    `SELECT proof_packs.* FROM proof_packs
     JOIN organization_members ON organization_members.organization_id = proof_packs.organization_id
     WHERE proof_packs.id = ? AND organization_members.user_id = ?`,
  )
    .bind(proofPackId, userId)
    .first<ProofPackRow>();
}

export async function getPackRole(env: Env, proofPackId: string, userId: string): Promise<OrganizationMemberRow["role"] | null> {
  const row = await env.DB.prepare(
    `SELECT organization_members.role FROM proof_packs
     JOIN organization_members ON organization_members.organization_id = proof_packs.organization_id
     WHERE proof_packs.id = ? AND organization_members.user_id = ?`,
  )
    .bind(proofPackId, userId)
    .first<{ role: OrganizationMemberRow["role"] }>();
  return row?.role ?? null;
}

export async function listProofPacks(env: Env, organizationId: string): Promise<ProofPackRow[]> {
  const result = await env.DB.prepare(`SELECT * FROM proof_packs WHERE organization_id = ? ORDER BY updated_at DESC`)
    .bind(organizationId)
    .all<ProofPackRow>();
  return result.results;
}

export async function getPlots(env: Env, proofPackId: string): Promise<PlotRow[]> {
  const result = await env.DB.prepare(`SELECT * FROM plots WHERE proof_pack_id = ? ORDER BY created_at ASC`).bind(proofPackId).all<PlotRow>();
  return result.results;
}

export async function getDocuments(env: Env, proofPackId: string): Promise<DocumentRow[]> {
  const result = await env.DB.prepare(`SELECT * FROM documents WHERE proof_pack_id = ? ORDER BY created_at DESC`).bind(proofPackId).all<DocumentRow>();
  return result.results;
}

export async function getRecentActivity(env: Env, organizationId: string): Promise<ActivityEventRow[]> {
  const result = await env.DB.prepare(`SELECT * FROM activity_events WHERE organization_id = ? ORDER BY created_at DESC LIMIT 8`)
    .bind(organizationId)
    .all<ActivityEventRow>();
  return result.results;
}

export async function addActivity(
  env: Env,
  organizationId: string,
  proofPackId: string | null,
  actorUserId: string | null,
  eventType: string,
  message: string,
  request?: Request,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO activity_events (id, organization_id, proof_pack_id, actor_user_id, event_type, message, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), organizationId, proofPackId, actorUserId, eventType, message, request?.headers.get("CF-Connecting-IP") ?? null, request?.headers.get("User-Agent") ?? null)
    .run();
}

export async function revokeSession(env: Env, sessionId: string): Promise<void> {
  await env.DB.prepare(`UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(sessionId).run();
}

export async function checkRateLimit(env: Env, action: string, identity: string, limit: number, windowSeconds: number): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);
  const id = `${action}:${identity}:${windowStart}`;
  await env.DB.prepare(
    `INSERT INTO rate_limits (id, action, identity, window_start, count) VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(action, identity, window_start) DO NOTHING`,
  )
    .bind(id, action, identity, windowStart)
    .run();
  const result = await env.DB.prepare(`UPDATE rate_limits SET count = count + 1 WHERE id = ? AND count < ?`).bind(id, limit).run();
  return (result.meta.changes ?? 0) > 0;
}
