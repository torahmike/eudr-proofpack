import type { ActivityEventRow, DocumentRow, OrganizationRow, PlotRow, ProofPackRow, SessionContext, UserRow } from "./types";

export async function getSessionContext(env: Env, sessionId: string): Promise<SessionContext | null> {
  const session = await env.DB.prepare(
    `SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ? AND sessions.expires_at > datetime('now')`,
  )
    .bind(sessionId)
    .first<UserRow>();
  if (!session) return null;

  const organization = await env.DB.prepare(
    `SELECT organizations.* FROM organizations
     JOIN organization_members ON organization_members.organization_id = organizations.id
     WHERE organization_members.user_id = ?
     ORDER BY organizations.created_at ASC LIMIT 1`,
  )
    .bind(session.id)
    .first<OrganizationRow>();
  return organization ? { user: session, organization } : null;
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
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO activity_events (id, organization_id, proof_pack_id, actor_user_id, event_type, message)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), organizationId, proofPackId, actorUserId, eventType, message)
    .run();
}
